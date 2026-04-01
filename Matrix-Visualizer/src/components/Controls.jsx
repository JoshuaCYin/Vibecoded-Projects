import React from 'react';
import { Play, RotateCcw, Box, Layers, MousePointer2 } from 'lucide-react';
import MathBreakdown from './MathBreakdown';

const MatrixInput = ({ dim, matrix, setter, label, onChange }) => (
  <div className="input-group">
    <label className="input-label">{label}</label>
    <div className="matrix-grid" data-size={dim}>
      {Array.from({ length: dim }).map((_, r) => (
        Array.from({ length: dim }).map((_, c) => (
          <input
            key={`m-${r}-${c}`}
            className="math-input"
            type="text"
            value={matrix[r]?.[c] === '0' && matrix[r]?.[c] !== 0 ? matrix[r]?.[c] : (matrix[r]?.[c] ?? '0')}
            onChange={(e) => onChange(e.target.value, r, c, setter, matrix)}
          />
        ))
      ))}
    </div>
  </div>
);

const VectorInput = ({ dim, vector, label, onChange }) => (
  <div className="input-group">
    <label className="input-label">{label}</label>
    <div className="matrix-grid" data-size="1" style={{gridTemplateColumns: '60px'}}>
      {Array.from({ length: dim }).map((_, r) => (
        <input
          key={`v-${r}`}
          className="math-input"
          type="text"
          value={vector[r] === '0' && vector[r] !== 0 ? vector[r] : (vector[r] ?? '0')}
          onChange={(e) => onChange(e.target.value, r)}
        />
      ))}
    </div>
  </div>
);

export default function Controls({
  dim, setDim, 
  matrixA, setMatrixA, 
  operand2, setOperand2,
  vectorX, setVectorX,
  scalarK, setScalarK,
  operation, setOperation,
  onPlay
}) {
  const operations = [
    { id: 'transform', label: 'Visualize Transformation', icon: <Layers size={16}/> },
    { id: 'mult', label: 'Matrix Multiplication (A × B)', icon: <Box size={16}/> },
    { id: 'apply_vector', label: 'Apply to Vector (A × x)', icon: <MousePointer2 size={16}/> },
    { id: 'scalar', label: 'Scalar Multiplication (A × k)' },
    { id: 'det', label: 'Determinant |A|' },
    { id: 'inv', label: 'Inverse A⁻¹' }
  ];

  const handleMatrixChange = (val, row, col, setter, sourceMatrix) => {
    const m = [...sourceMatrix];
    m[row] = [...m[row]];
    m[row][col] = val;
    setter(m);
  };

  const handleVectorChange = (val, idx) => {
    const v = [...vectorX];
    v[idx] = val;
    setVectorX(v);
  };
  return (
    <>
      <div>
        <h2 style={{fontSize: '1.25rem', marginBottom: '1.5rem'}}>Matrix Operations</h2>

        <div className="segmented-control" style={{marginBottom: '1.5rem'}}>
          <button 
            className={`segment-btn ${dim === 2 ? 'active' : ''}`}
            onClick={() => setDim(2)}
          >2D System</button>
          <button 
            className={`segment-btn ${dim === 3 ? 'active' : ''}`}
            onClick={() => setDim(3)}
          >3D System</button>
        </div>

        <div className="input-group" style={{marginBottom: '1.5rem'}}>
          <label className="input-label">Operation</label>
          <select 
            className="select-input" 
            value={operation} 
            onChange={(e) => setOperation(e.target.value)}
          >
            {operations.map(op => (
              <option key={op.id} value={op.id}>{op.label}</option>
            ))}
          </select>
        </div>

        <div style={{display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem'}}>
          <MatrixInput dim={dim} matrix={matrixA} setter={setMatrixA} label="Matrix A" onChange={handleMatrixChange} />
          
          {operation === 'mult' && (
            <MatrixInput dim={dim} matrix={operand2} setter={setOperand2} label="Matrix B" onChange={handleMatrixChange} />
          )}

          {operation === 'apply_vector' && (
             <VectorInput dim={dim} vector={vectorX} label="Vector x" onChange={handleVectorChange} />
          )}

          {operation === 'scalar' && (
            <div className="input-group">
              <label className="input-label">Scalar k</label>
              <input 
                className="math-input" 
                style={{width: '60px'}}
                type="text" 
                value={scalarK} 
                onChange={(e) => {
                  setScalarK(e.target.value);
                }}
              />
            </div>
          )}
        </div>

        <div style={{display: 'flex', gap: '0.75rem'}}>
          <button className="btn btn-primary" onClick={onPlay} style={{flex: 1}}>
            <Play size={16} /> Run Visualization
          </button>
          <button className="btn btn-icon" onClick={() => {
            // Reset to identity
            const ident = [['1','0','0'],['0','1','0'],['0','0','1']];
            setMatrixA(ident); setOperand2(ident); setVectorX(['1','1','0']); setScalarK('2');
            setTimeout(onPlay, 50); // Small delay to allow react state to batch and update engine inputs
          }}>
            <RotateCcw size={16} />
          </button>
        </div>
      </div>

      <div style={{marginTop: 'auto'}}>
         {/* The math breakdown dynamically displays based on state */}
         <MathBreakdown 
           dim={dim} 
           matrixA={matrixA} 
           operand2={operand2} 
           operation={operation} 
           vectorX={vectorX}
           scalarK={scalarK}
         />
      </div>
    </>
  );
}
