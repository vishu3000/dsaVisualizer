"""Iterative singly linked list reversal: prev / cur / nxt leapfrog."""
# @viz linkedlist head


class Node:
    def __init__(self, val):
        self.val = val
        self.next = None


def build(values):
    head = None
    for val in reversed(values):
        node = Node(val)
        node.next = head
        head = node
    return head


def to_list(head):
    out = []
    node = head
    while node is not None:
        out.append(node.val)
        node = node.next
    return out


def reverse(head):
    prev = None
    cur = head
    while cur is not None:
        nxt = cur.next
        cur.next = prev
        prev = cur
        cur = nxt
    return prev


head = build([1, 2, 3, 4, 5])
print(to_list(head))
head = reverse(head)
print(to_list(head))
