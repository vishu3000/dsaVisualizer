"""Backtracking: every subset, with each choice undone on the way out."""
# @viz list nums
# @viz list path


def subsets(nums):
    out = []
    path = []

    def backtrack(start):
        out.append(list(path))
        for i in range(start, len(nums)):
            path.append(nums[i])
            backtrack(i + 1)
            path.pop()

    backtrack(0)
    return out


nums = [1, 2, 3]
result = subsets(nums)
print(len(result))
print(result)
