#!/usr/bin/env python3
"""手机测试用的 HTTPS 开发服务器（摄像头 API 要求安全上下文）。

首次运行会自签一张证书（含本机局域网 IP 的 SAN），手机首次访问需手动信任。
用法: python3 serve-https.py [port]
"""
import os, ssl, sys, socket, subprocess, functools
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
CERT = os.path.join(ROOT, '.devcert.pem')


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        return s.getsockname()[0]
    except OSError:
        return '127.0.0.1'
    finally:
        s.close()


def ensure_cert(ip):
    if os.path.exists(CERT):
        return
    subprocess.run([
        'openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
        '-keyout', CERT, '-out', CERT, '-days', '825',
        '-subj', '/CN=sanxingdui-dev',
        '-addext', f'subjectAltName=DNS:localhost,IP:127.0.0.1,IP:{ip}',
    ], check=True, capture_output=True)
    print(f'已生成自签证书: {CERT}')


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


class DualStackServer(ThreadingHTTPServer):
    address_family = socket.AF_INET6

    def server_bind(self):
        self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        super().server_bind()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8443
ip = lan_ip()
ensure_cert(ip)

ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain(CERT)

httpd = DualStackServer(('::', port), functools.partial(NoCacheHandler, directory=ROOT))
httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)
print(f'本机  https://localhost:{port}/seal.html')
print(f'手机  https://{ip}:{port}/seal.html   （首次访问点"继续前往"信任证书）')
httpd.serve_forever()
