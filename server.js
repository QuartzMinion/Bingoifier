const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const BOARD_DIM = 5;
const rooms = {}; // Holds all active games. Key = Room Code

function generateRoomCode() {
    let code;
    do {
        code = Math.random().toString(36).substring(2, 6).toUpperCase();
    } while (rooms[code]);
    return code;
}

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    // Host creates a new room
    socket.on('createRoom', ({ boardItems, color }) => {
        const roomCode = generateRoomCode();
        
        rooms[roomCode] = {
            boardItems: boardItems,
            claimedCells: Array(BOARD_DIM).fill().map(() => Array(BOARD_DIM).fill(null)),
            players: [{ id: socket.id, color: color }] // Track active players and their colors
        };

        socket.join(roomCode);
        
        // Send room details to the host, designating them as the host
        socket.emit('roomJoined', { 
            roomCode: roomCode, 
            color: color, 
            boardItems: rooms[roomCode].boardItems, 
            claims: rooms[roomCode].claimedCells,
            isHost: true
        });
    });

    // Player joins an existing room
    socket.on('joinRoom', ({ roomCode, color }) => {
        roomCode = roomCode.toUpperCase();
        
        if (rooms[roomCode]) {
            // Check if color is already in use
            if (rooms[roomCode].players.some(p => p.color === color)) {
                socket.emit('errorMsg', 'That color is already taken by someone in the room!');
                return;
            }

            rooms[roomCode].players.push({ id: socket.id, color: color });
            socket.join(roomCode);
            
            socket.emit('roomJoined', { 
                roomCode: roomCode, 
                color: color, 
                boardItems: rooms[roomCode].boardItems, 
                claims: rooms[roomCode].claimedCells,
                isHost: false
            });
        } else {
            socket.emit('errorMsg', 'Room not found!');
        }
    });

    // Player clicks a cell
    socket.on('claimCell', ({ roomCode, row, col, color }) => {
        if (rooms[roomCode]) {
            const currentCell = rooms[roomCode].claimedCells[row][col];
            
            if (currentCell === null) {
                // Claim it
                rooms[roomCode].claimedCells[row][col] = color;
                io.to(roomCode).emit('updateClaim', { row, col, color });
            } else if (currentCell === color) {
                // Undo claim if it belongs to the player
                rooms[roomCode].claimedCells[row][col] = null;
                io.to(roomCode).emit('updateClaim', { row, col, color: null });
            }
        }
    });

    // Host Cheat Mode: Cycle through all active player colors + empty
    socket.on('cheatCycleCell', ({ roomCode, row, col }) => {
        if (rooms[roomCode]) {
            // Build an array of available colors + null (empty)
            const activeColors = rooms[roomCode].players.map(p => p.color);
            activeColors.push(null);

            const currentColor = rooms[roomCode].claimedCells[row][col];
            let currentIdx = activeColors.indexOf(currentColor);
            if (currentIdx === -1) currentIdx = activeColors.length - 1; // Default to null if color not found

            const nextIdx = (currentIdx + 1) % activeColors.length;
            const newColor = activeColors[nextIdx];

            rooms[roomCode].claimedCells[row][col] = newColor;
            io.to(roomCode).emit('updateClaim', { row, col, color: newColor });
        }
    });

    // Handle disconnects to free up colors
    socket.on('disconnect', () => {
        for (const code in rooms) {
            rooms[code].players = rooms[code].players.filter(p => p.id !== socket.id);
        }
    });
});

const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});