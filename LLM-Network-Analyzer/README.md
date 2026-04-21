# LLM Network Analyzer

## What it does

This tool captures network packets, analyzes traffic for anomalies, builds network graphs, performs traceroutes, and uses a large language model (LLM) to provide insights on network activity.

## How it works

The analysis follows a simple pipeline:

1. Capture network packets using packet sniffing.
2. Process packets into network flows and build a data frame.
3. Detect anomalies in the traffic data.
4. Optionally build an interactive network graph.
5. Optionally perform traceroutes to top destinations.
6. Optionally analyze results with an LLM for insights on patterns and issues.

For a visual overview, check out the diagrams in the /Diagrams folder.

## How to run it

1. Install dependencies: `pip install -r requirements.txt`
2. For command-line usage: Run `python main.py` and follow the prompts.
3. For the web dashboard: Run `streamlit run dashboard.py` (use `sudo` for live packet capture).

Note: Packet capture requires appropriate permissions and may need admin access.

This was a side project built quickly with minimal effort. It has limited real-world use but could serve as an educational tool for network analysis or a prototype for integrating AI into network monitoring.