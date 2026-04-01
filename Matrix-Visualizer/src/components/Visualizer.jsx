import React, { useEffect, useRef, useState } from 'react';
import { VisualizerEngine } from '../utils/visualizerEngine';
import { getActiveMatrix, computeMultiplication, computeInverse, formatNumber } from '../utils/mathOps';

export default function Visualizer({ 
  dim, matrix, operation, operand2, vectorX, scalarK, triggerAnim 
}) {
  const mountRef = useRef(null);
  const engineRef = useRef(null);
  const [baseCoords, setBaseCoords] = useState({ i: ['1','0','0'], j: ['0','1','0'], k: ['0','0','1'] });

  // Initialize engine once
  useEffect(() => {
    if (!mountRef.current) return;
    
    const engine = new VisualizerEngine(mountRef.current, dim);
    engineRef.current = engine;

    return () => {
      engine.cleanup();
    };
  }, []);

  // Update grid on dim change immediately
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.reset(dim);
      setBaseCoords({ i: ['1','0','0'], j: ['0','1','0'], k: ['0','0','1'] });
    }
  }, [dim]);

  // Handle triggered animation from Play button
  useEffect(() => {
    if (triggerAnim > 0 && engineRef.current) {
      let finalTransform;
      
      const matA = getActiveMatrix(matrix, dim);
      
      if (operation === 'transform' || operation === 'det' || operation === 'apply_vector') {
        finalTransform = matA;
      } else if (operation === 'mult') {
        const result = computeMultiplication(matrix, operand2, dim);
        finalTransform = result !== null ? result : matA;
      } else if (operation === 'scalar') {
        const k = isNaN(parseFloat(scalarK)) ? 0 : parseFloat(scalarK);
        finalTransform = matA.map(row => row.map(v => v * k));
      } else if (operation === 'inv') {
        const invMat = computeInverse(matrix, dim);
        finalTransform = invMat !== null ? invMat : matA;
      } else {
        finalTransform = matA;
      }
      
      engineRef.current.transform(finalTransform, dim, operation, vectorX);

      const f = (val) => formatNumber(val, 2);
      setBaseCoords({
         i: [f(finalTransform[0][0]), f(finalTransform[1][0]), dim===3?f(finalTransform[2][0]):'0'],
         j: [f(finalTransform[0][1]), f(finalTransform[1][1]), dim===3?f(finalTransform[2][1]):'0'],
         k: dim===3 ? [f(finalTransform[0][2]), f(finalTransform[1][2]), f(finalTransform[2][2])] : ['0','0','1']
      });
    }
  }, [triggerAnim]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
        <div 
          ref={mountRef} 
          style={{ width: '100%', height: '100%' }}
        />
        <div className="visualizer-overlay">
          <div className="glass-panel overlay-panel">
             <h4 style={{fontSize: '0.875rem', marginBottom: '0.25rem'}}>Transformation Space</h4>
             <p style={{fontSize: '0.75rem', color: 'var(--text-muted)'}}>
               {dim}D Euclidean Space<br />
               i ({formatVector(baseCoords.i, dim)})<br />
               j ({formatVector(baseCoords.j, dim)})
               {dim === 3 && <><br/>k ({formatVector(baseCoords.k, dim)})</>}
             </p>
          </div>
        </div>
    </div>
  );
}

function formatVector(coords, dim) {
  if (dim === 2) return `${coords[0]}, ${coords[1]}`;
  return `${coords[0]}, ${coords[1]}, ${coords[2]}`;
}
