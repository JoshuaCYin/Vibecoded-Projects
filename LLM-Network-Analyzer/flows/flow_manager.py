import time
from scapy.all import IP, TCP, UDP
from config import FLOW_TIMEOUT

flows = {}  # stores all flows
finished_flows = []

last_cleanup = time.time()

def reset_flows():
    """Clear all flow state. Call before starting a new capture session."""
    global flows, finished_flows, last_cleanup
    flows.clear()
    finished_flows.clear()
    last_cleanup = time.time()

# Makes a key for a flow given a packet
def make_flow_key(pkt):
    if IP in pkt:  # IP is needed to qualify as a packet we can use
        protoc = "TCP" if TCP in pkt else "UDP" if UDP in pkt else "OTHER"
        src = pkt[IP].src
        dst = pkt[IP].dst
        sport = pkt[TCP].sport if TCP in pkt else pkt[UDP].sport if UDP in pkt else 0
        dport = pkt[TCP].dport if TCP in pkt else pkt[UDP].dport if UDP in pkt else 0

        # bidirectional
        ip_pair = tuple(sorted([src, dst]))
        port_pair = tuple(sorted([sport, dport]))
        return (ip_pair, port_pair, protoc)

    return None

# Updates a flow given a packet, or creates a new flow if it doesn't exist yet
def update_flow(pkt):
    key = make_flow_key(pkt)  # key is (ip_pair, port_pair, protoc)
    if not key:
        return

    now = time.time()
    flow = flows.get(key)

    if not flow:
        # create new flow
        flows[key] = {
            "src": pkt[IP].src,
            "dst": pkt[IP].dst,
            "protoc": "TCP" if TCP in pkt else "UDP",
            "packets": 1,
            "bytes": len(pkt),
            "start_time": now,
            "end_time": now,
            "last_pkt_time": now,
            "iat_list": [],
            "fwd_packets": 1,
            "bwd_packets": 0,
            "fwd_bytes": len(pkt),
            "bwd_bytes": 0,
            "first_fwd_time": now,
            "first_bwd_time": None,
            "rtt": 0.0
        }
        return

    # update existing flow
    flow["packets"] += 1
    flow["bytes"] += len(pkt)
    flow["end_time"] = now

    # inter-arrival time
    iat = now - flow["last_pkt_time"]
    flow["iat_list"].append(iat)
    flow["last_pkt_time"] = now

    # direction
    if pkt[IP].src == flow["src"]:
        flow["fwd_packets"] += 1
        flow["fwd_bytes"] += len(pkt)
    else:
        # first backward packet
        if flow["first_bwd_time"] is None:
            flow["first_bwd_time"] = now
            flow["rtt"] = flow["first_bwd_time"] - flow["first_fwd_time"]

        flow["bwd_packets"] += 1
        flow["bwd_bytes"] += len(pkt)

def cleanup_flows(now):
    for key in list(flows.keys()):
        if now - flows[key]["end_time"] > FLOW_TIMEOUT:
            finished_flows.append(flows[key])
            del flows[key]

# Main packet handler
def handle_packet(pkt):
    global last_cleanup

    update_flow(pkt)

    # move old flows to finished flows
    now = time.time()
    if now - last_cleanup > 5:
        cleanup_flows(now)
        last_cleanup = now

def finalize_flows():
    # add remaining active flows
    finished_flows.extend(flows.values())
    return finished_flows