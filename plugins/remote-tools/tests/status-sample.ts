/** Linux procfs/df fixture with increasing counters; no terminal output or credentials. */
export function statusSample(step = 0, name = 'eth0') {
	return `__NEXUS_STATUS_OS_RELEASE__
PRETTY_NAME="Ubuntu 24.04 LTS"
__NEXUS_STATUS_CPU_MODEL__
AMD EPYC Preview
__NEXUS_STATUS_MEMINFO__
MemTotal: 8388608 kB
MemAvailable: 6291456 kB
SwapTotal: 2097152 kB
SwapFree: 1572864 kB
__NEXUS_STATUS_DISK__
Filesystem 1024-blocks Used Available Capacity Mounted on
/dev/sda1 104857600 41943040 62914560 40% /
__NEXUS_STATUS_PROC_STAT__
cpu ${100 + step * 40} 0 100 ${800 + step * 60} 0 0 0 0 0 0
__NEXUS_STATUS_LOADAVG__
0.12 0.34 0.56 1/200 1000
__NEXUS_STATUS_NET_ROUTE__
Iface Destination Gateway Flags
${name} 00000000 0100000A 0003
__NEXUS_STATUS_NET_DEV__
Inter-| Receive | Transmit
 face |bytes packets errs drop fifo frame compressed multicast|bytes packets errs drop fifo colls carrier compressed
${name}: ${100000 + step * 6000} 0 0 0 0 0 0 0 ${50000 + step * 3000} 0 0 0 0 0 0 0
`;
}
