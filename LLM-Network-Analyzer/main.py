from capture.sniffer import start_sniffing
from flows.flow_manager import finalize_flows
from analysis.dataframe_builder import build_dataframe
from analysis.anomaly import detect_anomalies
from llm.client import pass_to_llm, summarize
from capture.traceroute import perform_traceroutes
from analysis.visualize import build_network_graph
from config import system_prompt

def main():
    try:
        option_build_graph = input("Do you want to build a network graph? (y/n): ").strip().lower() == 'y'
        option_traceroute = input("Do you want to perform traceroutes (LLM analysis only available when traceroutes are performed)? (y/n): ").strip().lower() == 'y'
        if option_traceroute:
            option_use_llm = input("Do you want to analyze with LLM (Requires traceroutes)? (y/n): ").strip().lower() == 'y'
        else:
            option_use_llm = False

        print("Starting packet capture...")
        start_sniffing()

        print("Finalizing flows...")
        flows = finalize_flows()
        df = build_dataframe(flows)

        print(df.head(), "\n")

        print("Detecting anomalies...")
        anomalies = detect_anomalies(df)
        summary = summarize(df)

        if option_build_graph:
            print("Building network graph...")
            build_network_graph(df, "network_graph.html")

        if option_traceroute:
            print("Performing traceroutes to top destinations...")
            traces = perform_traceroutes(df)

        if option_use_llm:
            if option_traceroute and traces:
                print("Analyzing with LLM...")

                pass_to_llm({
                    "summary": summary,
                    "anomalies": anomalies.to_dict(orient="records"),
                    "traceroutes": traces
                }, system_prompt)
            else:
                print("LLM analysis skipped because traceroute option was not selected or traceroute data is not available.")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()