from scapy.all import sniff
from flows.flow_manager import handle_packet
from config import INTERFACE, PACKET_COUNT, TIMEOUT

def start_sniffing(interface=None, count=None, timeout=None):
    """Capture packets. Parameters override config defaults when provided."""
    iface   = interface if interface is not None else INTERFACE
    cnt     = count     if count     is not None else PACKET_COUNT
    t       = timeout   if timeout   is not None else TIMEOUT
    sniff(iface=iface, prn=handle_packet, count=cnt, timeout=t, promisc=True)