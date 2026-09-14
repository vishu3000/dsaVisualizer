"""Longest common subsequence, bottom-up. The 2D table fills row by row."""


def lcs(a, b):
    rows = len(a) + 1
    cols = len(b) + 1
    table = [[0] * cols for _ in range(rows)]
    for i in range(1, rows):
        for j in range(1, cols):
            if a[i - 1] == b[j - 1]:
                table[i][j] = table[i - 1][j - 1] + 1
            else:
                table[i][j] = max(table[i - 1][j], table[i][j - 1])
    return table[rows - 1][cols - 1], table


a = "AGCAT"
b = "GAC"
length, table = lcs(a, b)
print(length)
for row in table:
    print(row)
