#!/data/data/com.termux/files/usr/bin/bash

pkg update && pkg upgrade

pkg install nodejs

git clone https://tu-repositorio.git
cd tu-repositorio

node index.js