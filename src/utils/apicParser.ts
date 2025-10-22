export interface EndpointData {
  vlan: string;
  ip: string;
  paths: string[];
  pod: string;
}

export interface PathAttachment {
  vlan: string;
  epg: string;
  path: string;
  fullPath: string;
}

export interface ValidationResult {
  path: string;
  hasActiveEndpoint: boolean;
  isVlanAllowed: boolean;
  status: 'allowed' | 'not_allowed';
}

export function parseEndpointOutput(input: string): EndpointData | null {
  const lines = input.trim().split('\n');

  let vlan = '';
  let pod = '';
  const pathSet = new Set<string>();

  for (const line of lines) {
    const vlanMatch = line.match(/vlan-(\d+)/i);
    if (vlanMatch) {
      vlan = vlanMatch[1];
    }

    const vpcMatch = line.match(/(\d+)\s+(\d+)\s+vpc\s+([\d-]+-VPC-[\d-]+-PG)/i);
    if (vpcMatch) {
      const node1 = parseInt(vpcMatch[1]);
      if (node1 >= 400) {
        pod = 'pod-2';
      } else if (node1 >= 300) {
        pod = 'pod-1';
      }
      pathSet.add(vpcMatch[3]);
    }

    const ethMatch = line.match(/(\d+)\s+eth(\d+)\/(\d+)/i);
    if (ethMatch) {
      const node = parseInt(ethMatch[1]);
      if (node >= 400) {
        pod = 'pod-2';
      } else if (node >= 300) {
        pod = 'pod-1';
      }
      pathSet.add(`eth${ethMatch[2]}/${ethMatch[3]}`);
    }
  }

  if (vlan && pathSet.size > 0) {
    return {
      vlan,
      ip: '',
      paths: Array.from(pathSet),
      pod: pod || 'pod-1'
    };
  }

  return null;
}

export function parseMoqueryOutput(input: string): PathAttachment[] {
  const lines = input.trim().split('\n');
  const attachments: PathAttachment[] = [];

  for (const line of lines) {
    const dnMatch = line.match(/dn\s*:\s*uni\/tn-[^\/]+\/ap-[^\/]+\/epg-([^\/]+)\/rspathAtt-\[topology\/([^\]]+)\]/i);

    if (dnMatch) {
      const epg = dnMatch[1];
      const fullPath = dnMatch[2];

      const vlanMatch = epg.match(/VLAN(\d+)/i);
      const vlan = vlanMatch ? vlanMatch[1] : '';

      const pathMatch = fullPath.match(/pathep-\[([^\]]+)\]/);
      const pathName = pathMatch ? pathMatch[1] : '';

      if (vlan && pathName) {
        attachments.push({
          vlan,
          epg,
          path: pathName,
          fullPath
        });
      }
    }
  }

  return attachments;
}

export function validateVlanAllowances(
  endpointData: EndpointData,
  pathAttachments: PathAttachment[]
): ValidationResult[] {
  const results: ValidationResult[] = [];
  const allowedPaths = new Set(
    pathAttachments
      .filter(att => att.vlan === endpointData.vlan)
      .map(att => att.path)
  );

  for (const path of endpointData.paths) {
    const isAllowed = allowedPaths.has(path);

    results.push({
      path,
      hasActiveEndpoint: true,
      isVlanAllowed: isAllowed,
      status: isAllowed ? 'allowed' : 'not_allowed'
    });
  }

  return results;
}

export function generateCSV(
  vlan: string,
  epg: string,
  results: ValidationResult[],
  endpointData: EndpointData,
  pathAttachments: PathAttachment[]
): string {
  const header = 'VLAN,EPG,PATH';

  const notAllowedPaths = results
    .filter(r => r.status === 'not_allowed')
    .map(r => r.path);

  const pathMap = new Map<string, string>();
  for (const attachment of pathAttachments) {
    pathMap.set(attachment.path, attachment.fullPath);
  }

  const rows = notAllowedPaths.map(pathName => {
    let fullPath = pathMap.get(pathName);

    if (!fullPath) {
      const vpcMatch = pathName.match(/(\d+)-(\d+)-VPC-([\d-]+-PG)/);
      if (vpcMatch) {
        fullPath = `${endpointData.pod}/protpaths-${vpcMatch[1]}-${vpcMatch[2]}/pathep-[${pathName}]`;
      } else if (pathName.startsWith('eth')) {
        fullPath = `${endpointData.pod}/paths-XXX/pathep-[${pathName}]`;
      } else {
        fullPath = `${endpointData.pod}/paths-XXX/pathep-[${pathName}]`;
      }
    }

    return `${vlan},${epg},topology/${fullPath}`;
  });

  return header + '\n' + rows.join('\n');
}

export function extractPathName(path: string): string {
  return path;
}

export function extractVlanFromEpg(epgName: string): string {
  const vlanMatch = epgName.match(/VLAN(\d+)/i);
  return vlanMatch ? vlanMatch[1] : '';
}
