# Speech Text to SQL

### Instructions to Run:
You may need to install some things. Run these commands in order:
Mac:
1. ```python -m venv .venv``` to create a virtual environment
2. ```source .venv/bin/activate``` to activate the virtual environment
Windows:
1. ```python -m venv .venv``` to create a virtual environment
2. ```.\.venv\Scripts\activate``` to activate the virtual environment

Then, in the same terminal:
3. ```pip install -r requirements.txt``` to install dependencies
4. ```cd frontend``` to navigate to the frontend directory (if not already there)
5. ```npm install``` to install frontend dependencies
6. ```cd ..``` to navigate back to the root directory (if not already there)

Then, in two separate terminals:
7. Terminal 1: ```python server.py```
8. Terminal 2: ```cd frontend && npm run dev```