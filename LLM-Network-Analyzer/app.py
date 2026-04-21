import socket

ip_address = "35.186.224.36"

try:
    host_info = socket.gethostbyaddr(ip_address)
    print(f"Host name: {host_info[0]}")
except socket.herror:
    print(f"Could not resolve host for IP address: {ip_address}")