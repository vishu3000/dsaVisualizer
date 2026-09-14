"""Binary search: lo/hi converge on the target, mid probes the midpoint."""
# @viz list arr


def binary_search(arr, target):
    lo = 0
    hi = len(arr) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        guess = arr[mid]
        if guess == target:
            return mid
        if guess < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1


arr = [2, 5, 8, 12, 16, 23, 38, 56, 72, 91]
found = binary_search(arr, 23)
print(found)
