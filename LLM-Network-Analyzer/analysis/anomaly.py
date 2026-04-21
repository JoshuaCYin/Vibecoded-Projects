def detect_anomalies(df):
    df["bytes_per_packet"] = df["bytes"] / df["packets"]

    anomalies = df[
        (df["bytes"] > df["bytes"].quantile(0.95)) |
        (df["duration"] < 0.01) |
        (df["packets"] > df["packets"].quantile(0.95))
    ]

    return anomalies