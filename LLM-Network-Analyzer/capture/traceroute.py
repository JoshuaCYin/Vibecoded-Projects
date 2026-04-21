import subprocess
from config import TRACEROUTE_TOP_N

def perform_traceroutes(df):
    """
    Extract top N destinations by traffic volume and perform a traceroute on them
    to provide the LLM with multihop/routing data.
    """
    if df.empty:
        return {}

    # Find the top N destinations by bytes transferred
    top_destinations = df.groupby('dst')['bytes'].sum().nlargest(TRACEROUTE_TOP_N).index.tolist()
    
    traces = {}
    for ip in top_destinations:
        # Exclude local broadcast/multicast (basic heuristic)
        if ip.startswith("192.168.") or ip.startswith("10.") or ip.endswith(".255") or ip.startswith("224."):
            continue
        
        try:
            # -n: numeric output (faster)
            # -m 15: max 15 hops
            # -q 1: 1 probe per hop
            # -w 1: 1 second timeout per probe
            cmd = ["traceroute", "-n", "-m", "15", "-q", "1", "-w", "1", ip]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
            traces[ip] = result.stdout.strip()
        except Exception as e:
            traces[ip] = f"Traceroute failed: {str(e)}"
            
    return traces
