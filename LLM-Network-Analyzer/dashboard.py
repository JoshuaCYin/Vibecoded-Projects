"""
dashboard.py — Streamlit UI for LLM Network Analyzer.

Launch (upload / no capture):  streamlit run dashboard.py
Launch (live capture):         sudo streamlit run dashboard.py
"""

import os
import threading
import time
import webbrowser
from io import StringIO

import pandas as pd
import streamlit as st

# ---------------------------------------------------------------------------
# Page config — must be the FIRST Streamlit call
# ---------------------------------------------------------------------------
st.set_page_config(
    page_title="LLM Network Analyzer",
    page_icon="🔍",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ---------------------------------------------------------------------------
# Project imports
# ---------------------------------------------------------------------------
import config as cfg
from analysis.anomaly import detect_anomalies
from analysis.dataframe_builder import build_dataframe
from analysis.visualize import build_network_graph
from capture.traceroute import perform_traceroutes
from flows.flow_manager import finalize_flows, reset_flows
from llm.client import pass_to_llm, summarize

_PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
GRAPH_PATH = os.path.join(_PROJECT_DIR, "network_graph.html")

# ---------------------------------------------------------------------------
# Session state defaults
# ---------------------------------------------------------------------------
_DEFAULTS: dict = {
    "df": None,
    "anomalies": None,
    "llm_response": None,
    "traces": None,
    "graph_built": False,
    "running": False,
    "run_error": None,
}
for _k, _v in _DEFAULTS.items():
    if _k not in st.session_state:
        st.session_state[_k] = _v

_running: bool = st.session_state.running

# ===========================================================================
# SIDEBAR — feature toggles + settings only (upload moved to Run tab)
# ===========================================================================
with st.sidebar:
    st.markdown("### Network Analyzer")
    st.divider()

    # Feature toggles
    st.markdown("#### Features")
    opt_graph = st.checkbox("Build network graph", value=True, disabled=_running)
    opt_traceroute = st.checkbox("Perform traceroutes", value=False, disabled=_running)
    opt_llm = st.checkbox(
        "LLM analysis",
        value=False,
        disabled=(_running or not opt_traceroute),
        help="Requires *Perform traceroutes* to be enabled — "
             "hop data gives the LLM essential routing context.",
    )
    if not opt_traceroute:
        st.caption("Enable *Perform traceroutes* to unlock LLM analysis.")

    st.divider()

    # Capture settings
    st.markdown("#### Capture Settings")
    st.caption(":material/lock: Live capture requires running with `sudo`.")

    iface = st.text_input(
        "Interface", value=cfg.INTERFACE, disabled=_running,
        help="Network interface to sniff (e.g. `en0` on Mac, `eth0` on Linux). "
             "Run `ifconfig` or `ip link` to list available interfaces.",
    )
    pkt_count = int(st.number_input(
        "Packet count", min_value=0, value=int(cfg.PACKET_COUNT), step=50,
        disabled=_running,
        help="Packets to capture before stopping. Set to **0** to rely solely on the timeout.",
    ))
    timeout_val = int(st.number_input(
        "Capture timeout (s)", min_value=1, value=int(cfg.TIMEOUT), disabled=_running,
        help="Hard upper limit on capture duration. Stops automatically after this many seconds.",
    ))
    flow_timeout_val = int(st.number_input(
        "Flow timeout (s)", min_value=1, value=int(cfg.FLOW_TIMEOUT), disabled=_running,
        help="Seconds of inactivity before a flow is considered finished.",
    ))
    top_n_val = int(st.number_input(
        "Traceroute top N", min_value=1, value=int(cfg.TRACEROUTE_TOP_N), disabled=_running,
        help="Number of top destinations (by bytes) to run traceroutes against.",
    ))

    st.divider()

    # LLM settings
    st.markdown("#### LLM Settings")
    model_name_val = st.text_input(
        "Model", value=cfg.MODEL_NAME, disabled=_running,
        help="OpenAI model to use (e.g. `gpt-4o`, `gpt-5.4`).",
    )
    st.caption("System prompt — instructions sent to the LLM before your data. Locked while running.")
    system_prompt_val = st.text_area(
        "System prompt",
        value=cfg.system_prompt.strip(),
        height=160,
        disabled=_running,
        label_visibility="collapsed",
    )

# ===========================================================================
# MAIN AREA — TABS
# ===========================================================================
tab_run, tab_data, tab_llm, tab_about = st.tabs([
    ":material/play_arrow: Run",
    ":material/bar_chart: Data",
    ":material/psychology: LLM Analysis",
    ":material/info: About",
])

# ---------------------------------------------------------------------------
# TAB 1 — RUN
# ---------------------------------------------------------------------------
with tab_run:
    st.header("Run Pipeline")

    # ── Source selection (radio up-front, not buried in sidebar) ──────────
    st.markdown("#### Data Source")
    source_mode = st.radio(
        "Source mode",
        ["Live Capture", "Upload CSV"],
        horizontal=True,
        disabled=_running,
        label_visibility="collapsed",
    )

    uploaded_file = None
    if source_mode == "Upload CSV":
        st.caption("Upload a `.csv` file matching the `output.csv` column schema. No `sudo` required.")
        uploaded_file = st.file_uploader(
            "Drop a CSV here",
            type=["csv"],          # enforces .csv extension
            disabled=_running,
            label_visibility="collapsed",
        )
        _source_label = f"uploaded file ({uploaded_file.name})" if uploaded_file else "no file selected"
    else:
        # Subtle but visible note — caption with icon instead of a yellow warning box
        st.caption(
            ":material/lock: Live capture needs elevated permissions. "
            "Launch with `sudo streamlit run dashboard.py`."
        )
        _source_label = (
            f"live capture on `{iface}` "
            f"({timeout_val}s / {pkt_count if pkt_count else '∞'} packets)"
        )

    st.divider()

    # ── Action buttons ────────────────────────────────────────────────────
    col_run, col_graph = st.columns(2)
    with col_run:
        _run_disabled = _running or (source_mode == "Upload CSV" and uploaded_file is None)
        run_btn = st.button(
            "Start Analysis" if source_mode == "Live Capture" else "Analyze Uploaded Data",
            disabled=_run_disabled,
            width="stretch",
            type="primary",
            icon=":material/play_arrow:",
        )
    with col_graph:
        graph_btn = st.button(
            "Open Network Graph",
            disabled=not st.session_state.graph_built,
            width="stretch",
            icon=":material/open_in_new:",
        )

    if graph_btn and st.session_state.graph_built:
        webbrowser.open(f"file://{GRAPH_PATH}")
        st.toast("Graph opened in your default browser.")

    st.divider()

    # ── Pipeline execution ────────────────────────────────────────────────
    if run_btn and not _running:
        # Reset all previous results
        for _k, _v in _DEFAULTS.items():
            st.session_state[_k] = _v
        st.session_state.running = True

        # Apply sidebar values to config before running
        cfg.FLOW_TIMEOUT = flow_timeout_val
        cfg.TRACEROUTE_TOP_N = top_n_val
        cfg.MODEL_NAME = model_name_val

        with st.status(f"Running pipeline — {_source_label}…", expanded=True) as _status:
            try:
                # ── Step 1: Acquire data ─────────────────────────────────
                if source_mode == "Upload CSV":
                    st.write("Loading uploaded CSV…")
                    _raw = uploaded_file.read().decode("utf-8")
                    df = pd.read_csv(StringIO(_raw))
                    st.write(f"Loaded {len(df):,} rows from `{uploaded_file.name}`.")

                else:
                    from capture.sniffer import start_sniffing

                    reset_flows()

                    # Run capture in a background thread so we can show a countdown
                    _done = threading.Event()
                    _errors: list[str] = []

                    def _capture_worker() -> None:
                        try:
                            start_sniffing(
                                interface=iface,
                                count=pkt_count,
                                timeout=timeout_val,
                            )
                        except Exception as _e:
                            _errors.append(str(_e))
                        finally:
                            _done.set()

                    threading.Thread(target=_capture_worker, daemon=True).start()

                    # Live countdown / elapsed ticker
                    _countdown_slot = st.empty()
                    _t0 = time.time()
                    while not _done.is_set():
                        _elapsed = int(time.time() - _t0)
                        _remaining = max(0, timeout_val - _elapsed)
                        if pkt_count > 0:
                            _countdown_slot.write(
                                f"Capturing on `{iface}` — "
                                f"{_elapsed}s elapsed "
                                f"(limit: {timeout_val}s or {pkt_count} packets)"
                            )
                        else:
                            _bar = "█" * min(_elapsed, timeout_val) + "░" * max(0, timeout_val - _elapsed)
                            _countdown_slot.write(
                                f"Capturing on `{iface}` — {_remaining}s remaining\n\n"
                                f"`{_bar[:40]}`"
                            )
                        time.sleep(0.5)

                    _done.wait()
                    _countdown_slot.empty()

                    if _errors:
                        raise RuntimeError(_errors[0])

                    st.write("Finalizing flows…")
                    _flows = finalize_flows()
                    if not _flows:
                        _status.update(
                            label="No flows captured — check interface name and permissions.",
                            state="error",
                        )
                        st.session_state.running = False
                        st.stop()
                    st.write(f"{len(_flows):,} flows finalized.")
                    df = build_dataframe(_flows)

                # ── Step 2: Anomaly detection ────────────────────────────
                st.write("Detecting anomalies…")
                anomalies = detect_anomalies(df)
                st.write(f"{len(anomalies):,} anomalous flow(s) flagged.")
                st.session_state.df = df
                st.session_state.anomalies = anomalies

                # ── Step 3: Network graph ────────────────────────────────
                if opt_graph:
                    st.write("Building network graph…")
                    build_network_graph(df, GRAPH_PATH)
                    st.session_state.graph_built = True
                    st.write("Graph saved — click *Open Network Graph* above to view.")

                # ── Step 4: Traceroutes ──────────────────────────────────
                _traces = None
                if opt_traceroute:
                    st.write(f"Running traceroutes on top {top_n_val} destination(s)…")
                    _traces = perform_traceroutes(df)
                    st.session_state.traces = _traces
                    st.write(f"Traceroutes done ({len(_traces)} target(s) reached).")

                # ── Step 5: LLM analysis ─────────────────────────────────
                if opt_llm and opt_traceroute and _traces:
                    st.write("Sending to LLM…")
                    _summary = summarize(df)
                    _response = pass_to_llm(
                        {
                            "summary": _summary,
                            "anomalies": anomalies.to_dict(orient="records"),
                            "traceroutes": _traces,
                        },
                        system_prompt_val,
                    )
                    st.session_state.llm_response = _response
                    st.write("LLM analysis complete — see the LLM Analysis tab.")

                _status.update(label="Pipeline complete.", state="complete")

            except Exception as _exc:
                st.session_state.run_error = str(_exc)
                _status.update(label=f"Error: {_exc}", state="error")

            finally:
                st.session_state.running = False

        st.rerun()  # unlock all controls after run

    # ── Post-run summary metrics ──────────────────────────────────────────
    if st.session_state.df is not None:
        _df = st.session_state.df
        c1, c2, c3, c4 = st.columns(4)
        c1.metric("Total Flows", f"{len(_df):,}")
        c2.metric("Total Bytes", f"{int(_df['bytes'].sum()):,}")
        c3.metric("Unique IPs", len(set(_df["src"]).union(set(_df["dst"]))))
        c4.metric("Anomalies", len(st.session_state.anomalies))

    if st.session_state.run_error:
        st.error(f"Pipeline error: {st.session_state.run_error}")

# ---------------------------------------------------------------------------
# TAB 2 — DATA
# ---------------------------------------------------------------------------
with tab_data:
    st.header("Captured Flows")

    if st.session_state.df is not None:
        with st.expander("Column descriptions"):
            st.markdown(
                """
| Column | Description |
|---|---|
| `src` | Source IP address |
| `dst` | Destination IP address |
| `protoc` | Protocol (TCP / UDP / OTHER) |
| `packets` | Total packets in this flow |
| `bytes` | Total bytes transferred |
| `duration` | Flow duration in seconds |
| `fwd_packets` / `bwd_packets` | Packets sent in each direction |
| `fwd_bytes` / `bwd_bytes` | Bytes transferred in each direction |
| `rtt` | Estimated round-trip time (s) — derived from first fwd/bwd packet pair |
| `mean_iat` | Mean inter-arrival time between consecutive packets (s) |
| `max_iat` / `min_iat` | Largest / smallest inter-arrival times in this flow |
"""
            )

        st.dataframe(st.session_state.df, width="stretch")

        st.subheader("Anomalous Flows")
        _anoms = st.session_state.anomalies
        if _anoms is not None and not _anoms.empty:
            st.caption(
                "Flagged by: top 5th percentile of bytes or packets, "
                "or duration under 10 ms."
            )
            st.dataframe(_anoms, width="stretch")
        else:
            st.info("No anomalies detected in this capture.")
    else:
        st.info("Run the pipeline or upload a dataset to view data here.")

# ---------------------------------------------------------------------------
# TAB 3 — LLM ANALYSIS
# ---------------------------------------------------------------------------
with tab_llm:
    st.header("LLM Analysis")

    if st.session_state.llm_response:
        st.markdown(st.session_state.llm_response)
        if st.session_state.traces:
            with st.expander("Raw traceroute data"):
                for _ip, _trace in st.session_state.traces.items():
                    st.markdown(f"**{_ip}**")
                    st.code(_trace, language="text")
    elif st.session_state.df is not None:
        st.info(
            "LLM analysis was not run. "
            "Enable *Perform traceroutes* and *LLM analysis* in the sidebar, then run again."
        )
    else:
        st.info("Run the pipeline first to see LLM analysis here.")

# ---------------------------------------------------------------------------
# TAB 4 — ABOUT
# ---------------------------------------------------------------------------
with tab_about:
    st.header("About")
    st.markdown(
        """
**LLM Network Analyzer** captures raw network traffic, reconstructs bidirectional flows,
detects anomalies, maps routing paths, and asks an LLM to synthesize insights.

### Pipeline stages

| Stage | What it does |
|---|---|
| **Packet capture** | Sniffs raw IP/TCP/UDP packets on a chosen interface via Scapy |
| **Flow tracking** | Groups packets into bidirectional flows; tracks bytes, IAT, direction, RTT |
| **Anomaly detection** | Flags flows in the 95th percentile of bytes/packets, or with sub-10ms duration |
| **Network graph** | Heat-colored interactive graph (PyVis), saved as `network_graph.html` |
| **Traceroutes** | `traceroute` against top N destinations to expose routing hops |
| **LLM analysis** | Flow summary + anomalies + traceroutes sent to an OpenAI model |

### Notes
- Live capture requires `sudo` on macOS/Linux.
- Traceroutes skip private and broadcast IPs (192.168.x, 10.x, 224.x, .255).
- LLM analysis is gated on traceroutes — hop data is essential context for the model.
- The graph opens as a standalone HTML file in your browser and is overwritten each run.
"""
    )

    st.graphviz_chart(
        """
        digraph pipeline {
            rankdir=LR;
            node [shape=box, style="filled,rounded", fillcolor="#1e2130",
                  fontcolor="#e0e0e0", color="#4a5080", fontname="Arial", fontsize=11];
            edge [color="#6070b0", fontsize=10];

            Capture [label="Packet Capture"];
            Flows   [label="Flow Tracking"];
            Anomaly [label="Anomaly Detection"];
            Graph   [label="Network Graph"];
            Trace   [label="Traceroutes"];
            LLM     [label="LLM Analysis"];

            Capture -> Flows;
            Flows   -> Anomaly;
            Flows   -> Graph;
            Flows   -> Trace;
            Anomaly -> LLM [label="flagged flows"];
            Trace   -> LLM [label="hop data"];
        }
        """
    )
