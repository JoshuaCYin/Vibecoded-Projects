FLOW_TIMEOUT = 30  # seconds
INTERFACE = "en0"
PACKET_COUNT = 0
TIMEOUT = 30
TRACEROUTE_TOP_N = 3

MODEL_NAME = "gpt-5.4"
system_prompt = """
    Analyze this network activity and respond with insights.
    Focus on anomalies, unusual patterns, and heavy traffic sources.
    Consider the included traceroute/hop data to identify potential bottlenecks, high latency hops, or suboptimal routing strategies.
    Be concise: 3-5 sentences maximum. Use markdown. No preamble or closing remarks.
    """