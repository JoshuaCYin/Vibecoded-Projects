import { det, inv, multiply } from 'mathjs';

// Convert a flat 3x3 array to a pure array matching dim size
const parseValue = (val) => {
  if (val === '-' || val === '.' || val === '' || val === undefined) return 0;
  const num = parseFloat(val);
  return isNaN(num) ? 0 : num;
};

export const getActiveMatrix = (matrix, dim) => {
  if (dim === 2) {
    return [
      [parseValue(matrix[0][0]), parseValue(matrix[0][1])],
      [parseValue(matrix[1][0]), parseValue(matrix[1][1])],
    ];
  }
  return [
    [parseValue(matrix[0][0]), parseValue(matrix[0][1]), parseValue(matrix[0][2])],
    [parseValue(matrix[1][0]), parseValue(matrix[1][1]), parseValue(matrix[1][2])],
    [parseValue(matrix[2][0]), parseValue(matrix[2][1]), parseValue(matrix[2][2])],
  ];
};

export const getActiveVector = (vector, dim) => {
  if (dim === 2) {
    return [parseValue(vector[0]), parseValue(vector[1])];
  }
  return [parseValue(vector[0]), parseValue(vector[1]), parseValue(vector[2])];
}

export const computeDeterminant = (matrix, dim) => {
  try {
    const mat = getActiveMatrix(matrix, dim);
    return det(mat);
  } catch (e) {
    return null;
  }
};

export const computeInverse = (matrix, dim) => {
  try {
    const mat = getActiveMatrix(matrix, dim);
    return inv(mat);
  } catch (e) {
    return null; // Singular matrix
  }
};

export const computeMultiplication = (matrixA, matrixB, dim) => {
  try {
    const a = getActiveMatrix(matrixA, dim);
    const b = getActiveMatrix(matrixB, dim);
    return multiply(a, b);
  } catch (e) {
    return null;
  }
};

export const computeVectorApply = (matrixA, vectorX, dim) => {
  try {
    const a = getActiveMatrix(matrixA, dim);
    const x = getActiveVector(vectorX, dim);
    return multiply(a, x);
  } catch (e) {
    return null;
  }
};

// Formats a number to not have crazy floating points (e.g. 1.00000000000004 -> 1)
export const formatNumber = (num, decimals = 3) => {
  if (num === null || num === undefined || num === '' || num === '-') return '0';
  const parsed = parseFloat(num);
  if (isNaN(parsed)) return '0';
  const factor = Math.pow(10, decimals);
  const rounded = Math.round(parsed * factor) / factor;
  return Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(decimals);
};
