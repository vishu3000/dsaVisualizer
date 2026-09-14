"""Binary search tree: recursive insert, then an in-order walk."""
# @viz tree root


class Node:
    def __init__(self, key):
        self.key = key
        self.left = None
        self.right = None


def insert(node, key):
    if node is None:
        return Node(key)
    if key < node.key:
        node.left = insert(node.left, key)
    elif key > node.key:
        node.right = insert(node.right, key)
    return node


def inorder(node, out):
    if node is None:
        return out
    inorder(node.left, out)
    out.append(node.key)
    inorder(node.right, out)
    return out


root = None
for key in [50, 30, 70, 20, 40, 60]:
    root = insert(root, key)

print(inorder(root, []))
