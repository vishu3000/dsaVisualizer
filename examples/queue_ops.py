"""Queue: first in, first out.

Jobs are appended at the tail and served from the head. One job is requeued
while the queue is draining, so the tail grows after the head has moved.
"""

from collections import deque

# @viz deque queue
# @viz list served


def process(jobs):
    queue = deque()
    served = []

    for job in jobs:
        queue.append(job)

    while queue:
        job = queue.popleft()
        served.append(job)
        if job == "c":
            queue.append("c2")

    return served


order = process(["a", "b", "c", "d"])
print(order)
