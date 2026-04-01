import React, { useState } from 'react';
import Controls from './components/Controls';
import Visualizer from './components/Visualizer';

function App() {
  // State for matrix dimension (2 or 3)
  const [dim, setDim] = useState(2);
  
  // Matrix A (default 2x2 Identity)
  const [matrixA, setMatrixA] = useState([
    ['1', '0', '0'],
    ['0', '1', '0'],
    ['0', '0', '1']
  ]);

  // Matrix B, Vector x, or Scalar k depending on operation
  const [operand2, setOperand2] = useState([
    ['1', '0', '0'],
    ['0', '1', '0'],
    ['0', '0', '1']
  ]);
  
  // Single vector input
  const [vectorX, setVectorX] = useState(['1', '1', '0']);
  
  // Scalar input
  const [scalarK, setScalarK] = useState('2');

  // Available operations: 'transform', 'mult', 'scalar', 'det', 'inv', 'apply_vector'
  const [operation, setOperation] = useState('transform');

  // Trigger animation manually
  const [triggerAnim, setTriggerAnim] = useState(0);

  const handlePlayAnim = () => {
    setTriggerAnim(prev => prev + 1);
  };

  return (
    <div className="app-container">
      {/* Visualizer sits behind/alongside controls */}
      <div className="visualizer-pane">
        <Visualizer 
          dim={dim} 
          matrix={matrixA} 
          operation={operation} 
          operand2={operand2}
          vectorX={vectorX}
          scalarK={scalarK}
          triggerAnim={triggerAnim} 
        />
      </div>

      <div className="controls-pane">
        <Controls 
          dim={dim} 
          setDim={setDim}
          matrixA={matrixA} 
          setMatrixA={setMatrixA}
          operand2={operand2}
          setOperand2={setOperand2}
          vectorX={vectorX}
          setVectorX={setVectorX}
          scalarK={scalarK}
          setScalarK={setScalarK}
          operation={operation} 
          setOperation={setOperation}
          onPlay={handlePlayAnim}
        />
      </div>
    </div>
  );
}

export default App;
