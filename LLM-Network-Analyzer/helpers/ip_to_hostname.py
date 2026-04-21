import socket

def ip_to_hostname(ip_address):
    try:
        host_info = socket.gethostbyaddr(ip_address)
        return host_info[0]
    except socket.herror:
        # Fallback to IP address if hostname resolution fails
        return ip_address