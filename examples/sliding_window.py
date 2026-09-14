"""Sliding window: longest run of characters with no repeat.

The window is [left, right]; a repeat drags left forward until it closes.
"""
# @viz list chars
# @viz set seen


def longest_unique(chars):
    seen = set()
    left = 0
    best = 0
    best_span = (0, 0)
    for right in range(len(chars)):
        while chars[right] in seen:
            seen.discard(chars[left])
            left += 1
        seen.add(chars[right])
        width = right - left + 1
        if width > best:
            best = width
            best_span = (left, right)
    return best, best_span


chars = list("abcabcbb")
best, span = longest_unique(chars)
print(best, span)
