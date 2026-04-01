import React from 'react';
import { 
  computeDeterminant, 
  computeInverse, 
  computeMultiplication, 
  computeVectorApply,
  formatNumber,
  getActiveMatrix,
  getActiveVector
} from '../utils/mathOps';

export default function MathBreakdown({
  dim, matrixA, operand2, operation, vectorX, scalarK
}) {
  const renderMatrix = (matrix, prefix = '') => {
    if (!matrix) return null;
    return (
      <div className="math-expression">
        {prefix && <span>{prefix} = </span>}
        <div className="matrix-grid" data-size={dim} style={{border: 'none', padding: 0}}>
          {Array.from({ length: dim }).map((_, r) => (
            Array.from({ length: dim }).map((_, c) => (
              <span key={`mr-${r}-${c}`} style={{width: '40px', textAlign: 'center'}}>
                {formatNumber(matrix[r]?.[c] ?? matrix[r])}
              </span>
            ))
          ))}
        </div>
      </div>
    );
  };

  const renderVector = (vector, prefix = '') => {
    if (!vector) return null;
    return (
      <div className="math-expression">
        {prefix && <span>{prefix} = </span>}
        <div className="matrix-grid" data-size="1" style={{gridTemplateColumns: '40px', border: 'none', padding: 0}}>
          {Array.from({ length: dim }).map((_, r) => (
            <span key={`vr-${r}`} style={{textAlign: 'center'}}>
              {formatNumber(vector[r])}
            </span>
          ))}
        </div>
      </div>
    );
  };

  let mathContent = null;

  if (operation === 'transform') {
    mathContent = (
      <>
        <div className="math-step" style={{color: 'var(--text-muted)'}}>
          Applies Matrix A to all vectors in space.
        </div>
        {renderMatrix(getActiveMatrix(matrixA, dim), 'A')}
      </>
    );
  } else if (operation === 'mult') {
    const res = computeMultiplication(matrixA, operand2, dim);
    mathContent = (
      <>
        <div className="math-step">
          {renderMatrix(getActiveMatrix(matrixA, dim))}
          <span style={{margin: '0 0.5rem'}}>×</span>
          {renderMatrix(getActiveMatrix(operand2, dim))}
        </div>
        <div className="math-step">
          {renderMatrix(res, 'Result')}
        </div>
      </>
    );
  } else if (operation === 'apply_vector') {
    const res = computeVectorApply(matrixA, vectorX, dim);
    mathContent = (
      <>
        <div className="math-step">
          {renderMatrix(getActiveMatrix(matrixA, dim))}
          <span style={{margin: '0 0.5rem'}}>×</span>
          {renderVector(getActiveVector(vectorX, dim))}
        </div>
        <div className="math-step">
          {renderVector(res, 'Result')}
        </div>
      </>
    );
  } else if (operation === 'scalar') {
    const mat = getActiveMatrix(matrixA, dim);
    const res = mat.map(row => row.map(v => v * scalarK));
    mathContent = (
      <>
        <div className="math-step">
          <span>{scalarK}</span>
          <span style={{margin: '0 0.5rem'}}>×</span>
          {renderMatrix(mat)}
        </div>
        <div className="math-step">
          {renderMatrix(res, 'Result')}
        </div>
      </>
    );
  } else if (operation === 'det') {
    const detVal = computeDeterminant(matrixA, dim);
    mathContent = (
      <div className="math-step">
        <span>|A| = </span>
        {formatNumber(detVal)}
      </div>
    );
  } else if (operation === 'inv') {
    const invMat = computeInverse(matrixA, dim);
    mathContent = (
      <>
        <div className="math-step" style={{color: 'var(--text-secondary)'}}>
          A⁻¹ = 1/|A| × adj(A)
        </div>
        <div className="math-step">
          {invMat === null ? (
            <span style={{color: 'var(--accent-error)'}}>Matrix is singular (Det = 0)</span>
          ) : (
            renderMatrix(invMat, 'A⁻¹')
          )}
        </div>
      </>
    );
  }

  return (
    <div className="math-breakdown glass-panel">
      <h3 style={{marginBottom: '1rem', fontSize: '0.875rem', color: 'var(--text-secondary)'}}>
        Math Breakdown
      </h3>
      {mathContent}
    </div>
  );
}
