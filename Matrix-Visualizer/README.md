# Matrix Visualizer

An interactive linear algebra visualizer designed for students, educators, and anyone with some curiosity.
Built using **Vite**, **React**, **Three.js**, and **math.js**.

## Local Run Instructions

To run this application locally on your machine, you must have [Node.js](https://nodejs.org/en/) installed.
1. Open up your terminal to the directory containing this project.
2. Run `npm install` to download dependencies.
3. Run `npm run dev` to start the local development server.
4. Open the localhost URL displayed in your terminal!

## Features
- **Visual Transformations:** Enter a $2\times2$ or $3\times3$ matrix and watch a hardware-accelerated animated transition of the grid distortion in real time.
- **Math Operations:** Step-by-step mathematical breakdown for determinants, matrix multiplications, transpositions, and scalar operations without relying on complex notation.
- **Interactive UI:** A highly polished "glassmorphism" design with a dual pane interface.
- **Dimensionality Toggle:** Readily shift between 2D spaces and 3D spaces with adaptive WebGL cameras.

## How the Math Works

The engine dynamically takes any coordinate matrix $A$ you input into the UI as your *transformation matrix*. 
By default, the 2D Cartesian plane is formed by the basis vectors `i-hat (1,0)` and `j-hat (0,1)`.
When we apply a coordinate vector transformation mapping using standard Matrix Multiplication (wrapped securely in `math.js`), we shift the grid to its new position by mapping every line endpoint to:
$f(x) = Ax$

Our rendering class dynamically constructs a vanilla WebGL frame representation of this space, and iterates via a `requestAnimationFrame` loop to visually morph from an Identity State `I` to the new space formed by your `A` input over exactly $1500$ elapsed milliseconds. 