var package = require('../package.json');

const { remote  } = require("electron"); 
var ks = require('node-key-sender');
 
 
// Window
window.remote = remote;
window.app = remote.app;  
window.main = remote.main;

window.mouse = null;

// Move the mouse - needs to be something else.
window.moveMouse = function(x,y){
    const { spawn } = require('child_process');
    const ls = spawn(__dirname+'/nircmdc.exe', ['movecursor',x,y]);

    ls.stdout.on('data', (data) => {
    console.log(`stdout: ${data}`);
    });

    ls.stderr.on('data', (data) => {
    console.log(`stderr: ${data}`);
    });

    ls.on('close', (code) => {
    console.log(`child process exited with code ${code}`);
    }); 
} 

// Click the mouse
window.clickMouse = function(which, type){
    const { spawn } = require('child_process');
    const ls = spawn(__dirname+'/nircmdc.exe', ['sendmouse',which,type]);
  
    ls.on('close', (code) => {
    console.log(`child process exited with code ${code}`);
    }); 
} 

// Globals 

var websocket = { ws: null, pending: [] } 

// Send
var send = function(message){ 
    if (websocket.ws.online) websocket.ws.send(JSON.stringify(message));
    else websocket.pending.push(message);
}


// Establish Websocket.
var connect = function(){ 
    console.log("Connecting to WebSocket...");

    // Close any existing socket.    
    if (websocket.ws) websocket.ws.close();

    // Connect to a new socket.
    var ws = websocket.ws = new WebSocket(package.websocket);
    ws.onopen = function(){

	    console.log("App is online.");
        ws.online = Date.now();
        ws.offline = false;
        send(({"token": package.token}));

        if (websocket.pending.length>0){
            websocket.pending.forEach(message=>{
             send(message);    
            });
        }
    }
    ws.onclose = function(){ 
        if(ws.online){
            console.log("App went offline.");
            ws.online = false;
            ws.offline = Date.now();
            send({"offline":true});
        } else {
            console.log("App refused to connect to websocket.");
        }
    }

    ws.onmessage = function(message){

        console.log("App received message:", message);
        var cmd = message.data;
        command(cmd);
 
    }
};

// Command
var command = function(data){

    console.log("Processing command:", data);
    var cmd = JSON.parse(data);
    
    if (cmd.key){
        
        var comb = [];

        console.log('key:', cmd.key);
        if (cmd.ctrlKey)    comb.push('control');
        if (cmd.shiftKey)   comb.push('shift');
        if (cmd.altKey)     comb.push('alt'); 

        if (comb.length > 0) {
            comb.push('@'+cmd.keyCode);
            ks.sendCombination(comb);
        } else ks.sendKey('@'+cmd.keyCode);
    }

    if (cmd.mouse) {
        
        // Expect .x and .y.
        if (cmd.mouse.x && cmd.mouse.y) 
            cmd.mouse = cmd.mouse;

        else if (cmd.mouse == 'click')
            clickMouse('left', 'click');

        else if (cmd.mouse == 'dblclick')
            clickMouse('left', 'dblclick');

        else if (cmd.mouse == 'down')
            clickMouse('left', 'down');

        else if (cmd.mouse == 'up')
            clickMouse('left', 'up');
    }

    if (cmd.open) {
        
        if (cmd.open == 'contextmenu') {

            clickMouse('right', 'click');

        }

    }

    if (cmd.connection){

        var runOperation = function(item){
            
            var con = require('./connectors/' + item.connector.type + '.js'); 

            console.log(item.operation, item.input);
                    
            con[item.operation]( 

                item.connector, 

                window[item.connector.name], 

                item.input, 

                function(error, results){
                        
                    send(({results:{for:item, tracking:cmd.tracking, data:results}}));

                }
                        
            );
        }
        
        var item = cmd.connection;
 
            if (item.connector) {

                if (!window[item.connector.name]){ 
                    var con = require('./connectors/' + item.connector.type + '.js'); 

                    con.open(item.connector, function(error, connection){
                        console.error(error); 
                        window[item.connector.name] = connection;

                        runOperation(item);

                    });

                } else {

                    runOperation(item);

                }
            } 

    };

};

window.command = command;

// Connect to socket when page loads.
window.addEventListener('load', function(){
 
    console.log("Window loaded.");
    // Connect to Websocket
    connect();  
   
    // Checkup
    window.checkup = setInterval(function(){
        var total = 0, m = process.memoryUsage(), mp =  m.heapUsed/m.rss * 100
        app.getAppMetrics().forEach(part=>total += part.cpu.percentCPUUsage);
        document.title  = 'CPU: ' + parseFloat(total).toFixed(2) + '%' + ' ' + 'MEM: ' + parseFloat(mp).toFixed(2);
    }, 1000);

    // Set the mouse position.
    setInterval(function(){
        if (window.mouse) {
            moveMouse(window.mouse);
            window.mouse = null;
        }
        if (window.mymouse) {
            send(({mouse: {x: mymouse.x, y: mymouse.y}}));	
            window.mymouse = null;
        }
    },250);

});

window.addEventListener('mousemove', function(evt){
    window.mymouse = {x:evt.clientX, y:evt.clientY}
});

// Listen for key events.
window.addEventListener('keydown', function(evt){
    console.log(evt);
    send(({key: {key:evt.key, code:evt.code, keyCode:evt.keyCode, ctrlKey: evt.ctrlKey, shiftKey: evt.shiftKey, altKey: evt.altKey, charCode: evt.charCode, which:evt.which }}));	
});

window.addEventListener('mousedown', function(){
    send({mouse: 'down'});
});
 
window.addEventListener('mousedown', function(){
    send({mouse: 'up'});
});


window.addEventListener('click', function(){
    send({mouse: 'click'});
});

window.addEventListener('dblclick', function(){
    send({mouse: 'dblclick'});
});

window.addEventListener('contextmenu', function(){
    send({open: 'contextmenu'});
});