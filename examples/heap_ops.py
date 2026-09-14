"""Binary heap via heapq: push, pop, heapify.

The list is the heap; index i's children live at 2i+1 and 2i+2.
"""

import heapq

# @viz heap h


h = []
for value in [5, 3, 8, 1, 9, 2]:
    heapq.heappush(h, value)

drained = []
while h:
    drained.append(heapq.heappop(h))

nums = [7, 4, 11, 2, 6]
heapq.heapify(nums)
top = heapq.heappop(nums)

print(drained)
print(nums, top)
