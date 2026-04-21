import pandas as pd
import numpy as np

def build_dataframe(flows):
    rows = []

    for flow in flows:
        row = {
            "src": flow["src"],
            "dst": flow["dst"],
            "protoc": flow["protoc"],
            "packets": flow["packets"],
            "bytes": flow["bytes"],
            "duration": flow["end_time"] - flow["start_time"],
            "fwd_packets": flow["fwd_packets"],
            "bwd_packets": flow["bwd_packets"],
            "fwd_bytes": flow["fwd_bytes"],
            "bwd_bytes": flow["bwd_bytes"],
            "rtt": flow.get("rtt", 0.0),
            "mean_iat": np.mean(flow["iat_list"]) if flow["iat_list"] else 0, # mean inter-arrival time
            "max_iat": max(flow["iat_list"]) if flow["iat_list"] else 0, # max inter-arrival time
            "min_iat": min(flow["iat_list"]) if flow["iat_list"] else 0, # min inter-arrival time
        }
        rows.append(row)

    return pd.DataFrame(rows)