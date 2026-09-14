"""Recursive depth-first search. The call stack is the interesting part."""

from collections import defaultdict

# @viz graph adj
# @viz set visited


def dfs(adj, node, visited, order):
    visited.add(node)
    order.append(node)
    for nxt in adj[node]:
        if nxt not in visited:
            dfs(adj, nxt, visited, order)
    return order


adj = defaultdict(list)
for a, b in [(0, 1), (0, 2), (1, 3), (3, 4), (2, 5)]:
    adj[a].append(b)
    adj[b].append(a)

visited = set()
order = dfs(adj, 0, visited, [])
print(order)
