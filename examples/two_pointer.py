"""Two pointers closing in from both ends of a sorted list."""
# @viz list nums


def two_sum_sorted(nums, target):
    left = 0
    right = len(nums) - 1
    while left < right:
        total = nums[left] + nums[right]
        if total == target:
            return (left, right)
        if total < target:
            left += 1
        else:
            right -= 1
    return None


nums = [1, 3, 4, 6, 8, 11, 15]
pair = two_sum_sorted(nums, 14)
print(pair)
