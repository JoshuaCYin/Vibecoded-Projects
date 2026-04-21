import networkx as nx
from pyvis.network import Network

import matplotlib.cm as cm
import matplotlib.colors as mcolors
import numpy as np

from helpers.ip_to_hostname import ip_to_hostname
import pandas as pd

def build_network_graph(df, output_path="network_graph.html"):
    """
    Creates an interactive network graph HTML file representing captured traffic.
    Edges are colored by a heatmap scheme based on bytes.
    """
    if df.empty:
        return
    
    G = nx.DiGraph()
    
    # Group traffic by src and dst
    flow_grouped = df.groupby(['src', 'dst']).agg(
        total_bytes=('bytes', 'sum'),
        avg_rtt=('rtt', 'mean')
    ).reset_index()

    flow_grouped['src_host'] = flow_grouped['src'].apply(ip_to_hostname)
    flow_grouped['dst_host'] = flow_grouped['dst'].apply(ip_to_hostname)
    print(flow_grouped.head())
    
    # Create colormap based on bytes (using log scale to handle large variations)
    byte_values = np.log1p(flow_grouped['total_bytes']) # log1p to avoid log(0)
    min_b, max_b = byte_values.min(), byte_values.max()
    min_bytes_val = int(flow_grouped['total_bytes'].min()) if not flow_grouped.empty else 0
    max_bytes_val = int(flow_grouped['total_bytes'].max()) if not flow_grouped.empty else 0
    
    # Avoid division by zero if all values are the same
    if min_b == max_b:
        norm = mcolors.Normalize(vmin=min_b - 1, vmax=max_b + 1)
    else:
        norm = mcolors.Normalize(vmin=min_b, vmax=max_b)
        
    cmap = cm.get_cmap('plasma')
    
    # Add Nodes and Edges
    for _, row in flow_grouped.iterrows():
        src = row['src']
        dst = row['dst']
        src_host = row['src_host']
        dst_host = row['dst_host']
        
        # Create labels with hostname (IP) format, fallback to IP if hostname is same as IP
        src_label = f"{src_host}\n({src})" if src_host != src else src
        dst_label = f"{dst_host}\n({dst})" if dst_host != dst else dst
        
        G.add_node(src, title=f"{src_host}\n{src}", label=src_label)
        G.add_node(dst, title=f"{dst_host}\n{dst}", label=dst_label)
        
        # Calculate color
        color_rgba = cmap(norm(np.log1p(row['total_bytes'])))
        color_hex = mcolors.to_hex(color_rgba)
        
        G.add_edge(src, dst, 
                   color=color_hex,
                   width=2, # Fixed width instead of size-based for better readability
                   title=f"Bytes: {row['total_bytes']}     |     Avg RTT: {row['avg_rtt']:.4f}s")
    
    # Render with Pyvis
    net = Network(height="100vh", width="100%", directed=True, bgcolor="#222222", font_color="white")
    net.from_nx(G)
    
    net.write_html(output_path)
    
    # Post-process HTML to inject absolute positioned stats and color key
    total_bytes_all = df['bytes'].sum()
    total_flows = len(df)
    unique_ips = len(set(df['src']).union(set(df['dst'])))
    
    stats_html = f'''
    <div style="position: absolute; top: 20px; left: 20px; background-color: rgba(30, 30, 30, 0.85); 
                padding: 15px; border-radius: 8px; color: white; border: 1px solid #555; 
                font-family: Arial, sans-serif; z-index: 9999; box-shadow: 0px 4px 6px rgba(0,0,0,0.3);">
        <h3 style="margin-top: 0; margin-bottom: 10px; font-size: 16px;">Global Stats</h3>
        <div style="font-size: 14px;">
            Total Flows: {total_flows}<br>
            Total Bytes: {total_bytes_all}<br>
            Unique IPs: {unique_ips}
        </div>
    </div>
    '''
    
    legend_html = f'''
    <div style="position: absolute; bottom: 20px; right: 20px; background-color: rgba(30, 30, 30, 0.85); 
                padding: 15px; border-radius: 8px; color: white; border: 1px solid #555; 
                font-family: Arial, sans-serif; z-index: 9999; text-align: center; box-shadow: 0px 4px 6px rgba(0,0,0,0.3);">
        <h4 style="margin-top: 0; margin-bottom: 10px; font-size: 14px;">Traffic Volume (Bytes)</h4>
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 5px; font-size: 12px;">
            <span>{min_bytes_val}</span>
            <span>{max_bytes_val}</span>
        </div>
        <div style="width: 250px; height: 15px; background: linear-gradient(to right, #0d0887, #e06c38, #f0f921); border-radius: 5px; border: 1px solid #222;"></div>
    </div>
    '''
    
    try:
        with open(output_path, "r", encoding="utf-8") as f:
            html_content = f.read()
            
        style_override = """
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body, html { width: 100%; height: 100%; overflow: hidden; background-color: #222222; margin: 0; padding: 0; }
            #mynetwork { border: none !important; outline: none !important; width: 100vw !important; height: 100vh !important; }
            .card { border: none !important; border-radius: 0 !important; margin: 0 !important; width: 100vw !important; height: 100vh !important; }
        </style>
        """
        html_content = html_content.replace("</head>", f"{style_override}</head>")
        
        html_content = html_content.replace("<body>", "<body style=\"margin: 0; padding: 0; overflow: hidden;\">")
        html_content = html_content.replace("</body>", f"\n{stats_html}\n{legend_html}\n</body>")
        
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(html_content)
    except Exception as e:
        print(f"Failed to inject HTML overlays: {e}")
    
    print(f"Network graph saved to {output_path}")
