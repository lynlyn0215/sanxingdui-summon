#!/usr/bin/env python3
"""开发服务器：禁缓存，改完代码刷新即生效。用法: python3 serve.py [port]"""
import os, sys, socket, functools
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

class DualStackServer(ThreadingHTTPServer):
    """浏览器把 localhost 解析成 ::1 时，纯 IPv4 监听会连不上，故双栈监听。"""
    address_family = socket.AF_INET6

    def server_bind(self):
        self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        super().server_bind()

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
root = os.path.dirname(os.path.abspath(__file__))
handler = functools.partial(NoCacheHandler, directory=root)
print(f'serving {root} on http://localhost:{port} (no-store, dual-stack)')
DualStackServer(('::', port), handler).serve_forever()
