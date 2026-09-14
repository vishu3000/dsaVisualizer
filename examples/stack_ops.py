"""Stack: last in, first out.

Brackets are pushed as they open and popped as they close, so the stack is
empty exactly when every bracket has been matched.
"""
# @viz list stack
# @viz list chars

CLOSERS = {")": "(", "]": "[", "}": "{"}


def is_balanced(chars):
    stack = []
    for i in range(len(chars)):
        ch = chars[i]
        if ch in "([{":
            stack.append(ch)
        elif ch in CLOSERS:
            if not stack or stack[-1] != CLOSERS[ch]:
                return False
            stack.pop()
    return not stack


chars = list("{[()]}")
print(is_balanced(chars))

chars = list("([)]")
print(is_balanced(chars))
