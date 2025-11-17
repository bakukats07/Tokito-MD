#!/data/data/com.termux/files/usr/bin/bash

# Actualizar paquetes
pkg update && pkg upgrade

# Instalar Node.js y npm
pkg install nodejs

# Clonar el repositorio (ajusta la URL a tu repositorio)
git clone https://tu-repositorio.git
cd tu-repositorio

# Instalar dependencias
npm install

# Iniciar el bot
node index.js