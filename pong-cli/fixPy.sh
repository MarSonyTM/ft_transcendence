#!/bin/bash

echo "Fixing Python environment..."

python3 -m venv ~/fuckpy

echo "alias fuckpy='source ~/fuckpy/bin/activate'" >> ~/.bashrc

source ~/fuckpy/bin/activate

pip install httpx

pip install websockets

echo -e "Packages are now installed!\n"

echo "Virtual environment is ready. Restart your terminal or run 'source ~/.bashrc'"
echo "Then type 'fuckpy' to activate the environment in future sessions"