"""Breadth-first search over a defaultdict(list) adjacency map."""

from collections import defaultdict, deque

# @viz graph adj
# @viz deque queue
# @viz set visited


def build_graph(edges):
    adj = defaultdict(list)
    for a, b in edges:
        adj[a].append(b)
        adj[b].append(a)
    return adj


def bfs(adj, start):
    queue = deque([start])
    visited = {start}
    order = []
    dist = {start: 0}
    while queue:
        node = queue.popleft()
        order.append(node)
        for nxt in adj[node]:
            if nxt not in visited:
                visited.add(nxt)
                dist[nxt] = dist[node] + 1
                queue.append(nxt)
    return order, dist


edges = [(0, 1), (0, 2), (1, 3), (2, 4), (3, 5), (4, 5)]
adj = build_graph(edges)
order, dist = bfs(adj, 0)
print(order)
print(dist)
