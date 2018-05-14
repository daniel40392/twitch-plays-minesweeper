(function () {
    document.addEventListener('DOMContentLoaded', function () {
        var canvas = document.getElementById('game');
        canvas.addEventListener('click', leftClick);
        canvas.addEventListener('contextmenu', rightClick);
        var ctx = canvas.getContext('2d');

        var width = canvas.width;
        var height = canvas.height;

        var gridSize = 20;
        var mineDensity = 0.2;
        var axisWidth = 20;
        var nw = Math.floor((width - 2 * axisWidth) / gridSize);
        var nh = Math.floor((height - 2 * axisWidth) / gridSize);
        document.getElementById('size-text').innerText = nw + 'x' + nh;

        var cellData = [];
        var users = [];
        var firstDig = true;

        function updateLeaderboard() {
            var contents = '';
            var leaderBoardNameList = document.getElementById('leaderboard-name-list');
            users.sort(function (lhs, rhs) {
                if (lhs.score > rhs.score) {
                    return -1;
                }
                if (lhs.score < rhs.score) {
                    return 1;
                }
                return 0;
            });
            for (var i = 0, l = Math.min(10, users.length); i < l; ++i) {
                var user = users[i];
                if (user.score > 0 || user.disqualified) {
                    contents += '<li style="color:' + users[i].color + ';">' + users[i].userName + ' (' + users[i].score + (users[i].disqualified ? ', RIP' : '') + ')</li>';
                }
            }
            leaderBoardNameList.innerHTML = contents;
        }

        function locateUser(userName, createIfNotFound) {
            for (var i = 0, l = users.length; i < l; ++i) {
                if (users[i].userName === userName) {
                    return users[i];
                }
            }
            if (createIfNotFound) {
                users.push({
                    userName: userName,
                    score: 0,
                    disqualified: false,
                    color: '#000000'
                });
                return users[users.length - 1];
            } else {
                return null;
            }
        }

        function executeCommand(message, userTypingTheCommand) {
            var r = /^!d(?:ig)?\s+(\d+)\s*,\s*(\d+)\s*$/;
            var m = message.match(r);
            if (m) {
                uncoverTile(parseInt(m[1], 10), nh - 1 - parseInt(m[2], 10), userTypingTheCommand);
            }
            r = /^!f(?:lag)?\s+(\d+)\s*,\s*(\d+)\s*$/;
            m = message.match(r);
            if (m) {
                toggleFlag(parseInt(m[1], 10), nh - 1 - parseInt(m[2], 10), userTypingTheCommand);
            }
            r = /^!c(?:heck)?\s+(\d+)\s*,\s*(\d+)\s*$/;
            m = message.match(r);
            if (m) {
                checkNumber(parseInt(m[1], 10), nh - 1 - parseInt(m[2], 10), userTypingTheCommand);
            }
            r = /^!s(?:tatus)?\s*$/;
            m = message.match(r);
            if (m) {
                showStatus(userTypingTheCommand);
            }
            if (userTypingTheCommand.userName === BOT_USERNAME || userTypingTheCommand.userName === STREAMER) {
                r = /^!reset\s*$/;
                m = message.match(r);
                if (m) {
                    initData();
                    updateLeaderboard();
                    drawAllTheThings();
                }
                r = /^!revive (\S+)\s*$/;
                m = message.match(r);
                if (m) {
                    var toBeRevived = locateUser(m[1], false);
                    if (toBeRevived) {
                        sentMessageToChat('Reviving ' + toBeRevived.userName);
                        toBeRevived.disqualified = false;
                        updateLeaderboard();
                        drawAllTheThings();
                    } else {
                        sentMessageToChat('User ' + m[1] + ' not found');
                    }
                }
            }
        }

        function getNeighbours(x, y) {
            var neighbours = [];
            if (x > 0) {
                if (y > 0) {
                    neighbours.push(cellData[y - 1][x - 1]);
                }
                neighbours.push(cellData[y][x - 1]);
                if (y < nh - 1) {
                    neighbours.push(cellData[y + 1][x - 1]);
                }
            }
            if (x < nw - 1) {
                if (y > 0) {
                    neighbours.push(cellData[y - 1][x + 1]);
                }
                neighbours.push(cellData[y][x + 1]);
                if (y < nh - 1) {
                    neighbours.push(cellData[y + 1][x + 1]);
                }
            }
            if (y > 0) {
                neighbours.push(cellData[y - 1][x]);
            }
            if (y < nh - 1) {
                neighbours.push(cellData[y + 1][x]);
            }
            return neighbours;
        }

        if (CONNECT_TO_CHAT) {
            var ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443/', 'irc');

            ws.onmessage = function (message) {
                if (message !== null) {
                    var parsed = parseMessage(message.data);
                    if (parsed !== null) {
                        if (parsed.command === "PRIVMSG") {
                            console.log('Got a message ' + JSON.stringify(parsed));
                            console.log('MSG: ' + parsed.message + ' from ' + parsed.username);
                            var user = locateUser(parsed.username, true);
                            var colorRegexMatch = parsed.tags.match(/color=(#[0-9A-Fa-f]{6});/);
                            if (colorRegexMatch) {
                                user.color = colorRegexMatch[1];
                            }

                            executeCommand(parsed.message, user);
                        } else if (parsed.command === "PING") {
                            ws.send("PONG :" + parsed.message);
                        }
                    }
                }
            };
            ws.onerror = function (message) {
                console.log('Error: ' + message);
            };
            ws.onclose = function () {
                console.log('Disconnected from the chat server.');
            };
            ws.onopen = function () {
                if (ws !== null && ws.readyState === 1) {
                    console.log('Connecting and authenticating...');

                    ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands twitch.tv/membership');
                    ws.send('PASS ' + BOT_OAUTH_TOKEN);
                    ws.send('NICK ' + BOT_USERNAME);
                    ws.send('JOIN ' + CHANNEL);
                }
            };
            document.getElementById('offline-command-container').outerHTML = '';
        } else {
            document.getElementById('offline-command-field').addEventListener('keydown', function (ev) {
                if (ev.keyCode === 13) {
                    // the newline at the end is what we get from twitch chat too so we are better off
                    // having a realistic imitation here to avoid discovering bugs in regexes later on
                    executeCommand(ev.target.value + '\r\n', locateUser(STREAMER, true));
                }
            });
        }

        function sentMessageToChat(message) {
            if (ws) {
                ws.send("PRIVMSG " + CHANNEL + " :" + message + '\r\n');
            } else {
                console.log(message);
            }
        }

        function parseMessage(rawMessage) {
            var parsedMessage = {
                message: null,
                tags: null,
                command: null,
                original: rawMessage,
                channel: null,
                username: null
            };

            if(rawMessage[0] === '@'){
                var tagIndex = rawMessage.indexOf(' '),
                    userIndex = rawMessage.indexOf(' ', tagIndex + 1),
                    commandIndex = rawMessage.indexOf(' ', userIndex + 1),
                    channelIndex = rawMessage.indexOf(' ', commandIndex + 1),
                    messageIndex = rawMessage.indexOf(':', channelIndex + 1);

                parsedMessage.tags = rawMessage.slice(0, tagIndex);
                parsedMessage.username = rawMessage.slice(tagIndex + 2, rawMessage.indexOf('!'));
                parsedMessage.command = rawMessage.slice(userIndex + 1, commandIndex);
                parsedMessage.channel = rawMessage.slice(commandIndex + 1, channelIndex);
                parsedMessage.message = rawMessage.slice(messageIndex + 1);
            } else if(rawMessage.startsWith("PING")) {
                parsedMessage.command = "PING";
                parsedMessage.message = rawMessage.split(":")[1];
            }

            return parsedMessage;
        }

        function initData() {
            cellData = [];
            firstDig = true;
            for (var y = 0; y < nh; ++y) {
                var cellDataLine = [];
                cellData.push(cellDataLine);
                for (var x = 0; x < nw; ++x) {
                    cellDataLine.push({
                        x: x,
                        y: y,
                        isMine: Math.random() < mineDensity,
                        isExploded: false,
                        isUncovered: false,
                        neighbouringMineCount: 0,
                        isFlagged: false
                    });
                }
            }

            for (var y = 0; y < nh; ++y) {
                for (var x = 0; x < nw; ++x) {
                    var cell = cellData[y][x];
                    if (!cell.isMine) {
                        continue;
                    }
                    var neighbours = getNeighbours(x, y);
                    for (var i = 0, l = neighbours.length; i < l; ++i) {
                        ++neighbours[i].neighbouringMineCount;
                    }
                }
            }

            users = [];
            updateLeaderboard();
        }

        function clearField() {
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, width, height);
        }

        function showStatus(userExecutingTheCommand) {
            sentMessageToChat('Hello ' + userExecutingTheCommand.userName + ' you are ' + (userExecutingTheCommand.disqualified ? 'dead' : 'alive') + ' and have ' + userExecutingTheCommand.score + ' points.');
        }

        function drawGrid() {
            for (var y = 0; y < nh + 1; ++y) {
                ctx.strokeStyle = 'black';
                ctx.beginPath();
                ctx.moveTo(0, gridSize * y);
                ctx.lineTo(nw * gridSize, gridSize * y);
                ctx.stroke();
                ctx.closePath();
            }
            for (var x = 0; x < nw + 1; ++x) {
                ctx.strokeStyle = 'black';
                ctx.beginPath();
                ctx.moveTo(gridSize * x, 0);
                ctx.lineTo(gridSize * x, nh * gridSize);
                ctx.stroke();
                ctx.closePath();
            }
        }

        function drawMineAt(x, y, isExploded) {
            var mineColor = isExploded ? 'red' : 'black';
            ctx.strokeStyle = mineColor;
            ctx.fillStyle = mineColor;
            ctx.beginPath();
            ctx.arc((x + 0.5) * gridSize, (y + 0.5) * gridSize, gridSize * 0.25, 0, 2 * Math.PI, false);
            ctx.fill();
            ctx.closePath();

            ctx.beginPath();
            ctx.moveTo(gridSize * (x + 0.1), gridSize * (y + 0.5));
            ctx.lineTo(gridSize * (x + 0.9), gridSize * (y + 0.5));
            ctx.stroke();
            ctx.closePath();

            ctx.beginPath();
            ctx.moveTo(gridSize * (x + 0.5), gridSize * (y + 0.1));
            ctx.lineTo(gridSize * (x + 0.5), gridSize * (y + 0.9));
            ctx.stroke();
            ctx.closePath();

            ctx.beginPath();
            ctx.moveTo(gridSize * (x + 0.2), gridSize * (y + 0.2));
            ctx.lineTo(gridSize * (x + 0.8), gridSize * (y + 0.8));
            ctx.stroke();
            ctx.closePath();

            ctx.beginPath();
            ctx.moveTo(gridSize * (x + 0.8), gridSize * (y + 0.2));
            ctx.lineTo(gridSize * (x + 0.2), gridSize * (y + 0.8));
            ctx.stroke();
            ctx.closePath();

            ctx.fillStyle = 'white';
            ctx.fillRect(gridSize * (x + 0.5) - 3, gridSize * (y + 0.5) - 3, 2, 2)
        }

        function drawCoveredCellAt(x, y) {
            ctx.fillStyle = 'rgb(128, 128, 128)';
            ctx.beginPath();
            ctx.moveTo(gridSize * (x + 1), gridSize * y);
            ctx.lineTo(gridSize * x + 1, gridSize * (y + 1));
            ctx.lineTo(gridSize * (x + 1), gridSize * (y + 1));
            ctx.fill();
            ctx.closePath();

            ctx.fillStyle = 'rgb(240, 240, 240)';
            ctx.beginPath();
            ctx.moveTo(gridSize * (x + 1), gridSize * y);
            ctx.lineTo(gridSize * x, gridSize * (y + 1));
            ctx.lineTo(gridSize * x, gridSize * y);
            ctx.fill();
            ctx.closePath();

            ctx.fillStyle = 'rgb(200, 200, 200)';
            ctx.fillRect(gridSize * x + 3, gridSize * y + 3, gridSize - 6, gridSize - 6);
        }

        function drawNeighbourCountAt(x, y, count) {
            if (count) {
                switch (count) {
                    case 1:
                        ctx.fillStyle = 'blue';
                        break;
                    case 2:
                        ctx.fillStyle = 'green';
                        break;
                    case 3:
                        ctx.fillStyle = 'red';
                        break;
                    case 4:
                        ctx.fillStyle = 'rgb(0,0,100)';
                        break;
                    case 5:
                        ctx.fillStyle = 'rgb(100,0,0)';
                        break;
                    case 6:
                        ctx.fillStyle = 'turquoise';
                        break;
                    case 7:
                        ctx.fillStyle = 'purple';
                        break;
                    default:
                        ctx.fillStyle = 'black';
                        break;
                }
                ctx.textAlign = 'center';
                ctx.font = "16px Arial";
                ctx.fillText(count, gridSize * (x + 0.5), gridSize * (y + 0.5));
            }
        }

        function drawFlagAt(x, y) {
            ctx.strokeStyle = 'black';
            ctx.beginPath();
            ctx.moveTo(gridSize * (x + 0.3), gridSize * (y + 0.75));
            ctx.lineTo(gridSize * (x + 0.7), gridSize * (y + 0.75));
            ctx.moveTo(gridSize * (x + 0.5), gridSize * (y + 0.75));
            ctx.lineTo(gridSize * (x + 0.5), gridSize * (y + 0.6));
            ctx.stroke();
            ctx.closePath();

            ctx.fillStyle = 'red';
            ctx.beginPath();
            ctx.moveTo(gridSize * (x + 0.5), gridSize * (y + 0.6));
            ctx.lineTo(gridSize * (x + 0.5), gridSize * (y + 0.2));
            ctx.lineTo(gridSize * (x + 0.3), gridSize * (y + 0.4));
            ctx.fill();
            ctx.closePath();
        }

        function drawAllTheThings() {
            clearField();

            drawAxis();

            ctx.save();
            ctx.transform(1, 0,  0, 1, axisWidth, axisWidth);
            drawGrid();

            for (var y = 0; y < nh; ++y) {
                for (var x = 0; x < nw; ++x) {
                    var cell = cellData[y][x];
                    if (!cell.isUncovered) {
                        drawCoveredCellAt(x, y);
                        if (cell.isFlagged) {
                            drawFlagAt(x, y);
                        }
                    } else if (cell.isMine) {
                        drawMineAt(x, y, cell.isExploded);
                    } else {
                        drawNeighbourCountAt(x, y, cell.neighbouringMineCount);
                    }
                }
            }
            ctx.restore();
        }

        function drawAxis() {
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = "11px LM Mono 12";
            ctx.strokeStyle = 'black';
            ctx.save();
            ctx.transform(1, 0, 0, 1, axisWidth, 0);
            for (var x = 0; x < nw; ++x) {
                ctx.beginPath();
                ctx.moveTo(gridSize * (x + 0.5), axisWidth * 0.8);
                ctx.lineTo(gridSize * (x + 0.5), axisWidth);
                ctx.stroke();
                ctx.closePath();
                ctx.strokeText(x, gridSize * (x + 0.5), axisWidth * 0.4);

                ctx.beginPath();
                ctx.moveTo(gridSize * (x + 0.5), (nh + 1) * gridSize);
                ctx.lineTo(gridSize * (x + 0.5), (nh + 1) * gridSize + axisWidth * 0.2);
                ctx.stroke();
                ctx.closePath();
                ctx.strokeText(x, gridSize * (x + 0.5), (nh + 1) * gridSize + axisWidth * 0.6);
            }
            ctx.restore();
            ctx.save();
            ctx.transform(1, 0, 0, 1, 0, axisWidth);
            for (var y = 0; y < nh; ++y) {
                ctx.beginPath();
                ctx.moveTo(axisWidth * 0.8, gridSize * (y + 0.5));
                ctx.lineTo(axisWidth, gridSize * (y + 0.5));
                ctx.stroke();
                ctx.closePath();
                ctx.strokeText((nh - 1 - y), axisWidth * 0.4, gridSize * (y + 0.5));

                ctx.beginPath();
                ctx.moveTo((nw + 1) * gridSize, gridSize * (y + 0.5));
                ctx.lineTo((nw + 1) * gridSize + axisWidth * 0.2, gridSize * (y + 0.5));
                ctx.stroke();
                ctx.closePath();
                ctx.strokeText((nh - 1 - y), (nw + 1) * gridSize + axisWidth * 0.6, gridSize * (y + 0.5));
            }
            ctx.restore();
        }

        function leftClick(event) {
            var mouseX = event.clientX - canvas.offsetLeft - axisWidth;
            var mouseY = event.clientY - canvas.offsetTop - axisWidth;
            var x = Math.floor(mouseX / gridSize);
            var y = Math.floor(mouseY / gridSize);
            uncoverTile(x, y, locateUser(STREAMER, true));
        }

        function rightClick(event) {
            var mouseX = event.clientX - canvas.offsetLeft - axisWidth;
            var mouseY = event.clientY - canvas.offsetTop - axisWidth;
            var x = Math.floor(mouseX / gridSize);
            var y = Math.floor(mouseY / gridSize);
            toggleFlag(x, y, locateUser(STREAMER, true));
        }

        function uncoverTile(x, y, user) {
            var cell = cellData[y][x];
            if (user.disqualified || cell.isUncovered) {
                return;
            }
            if (cell.isMine) {
                if (firstDig) { // if is 1st dig... make new baord
                  initData();
                  uncoverTile(x, y, user);
                  return;
                }
                cell.isFlagged = false;
                cell.isUncovered = true;
                cell.isExploded = true;
                user.disqualified = true;
                sentMessageToChat(user.userName + ' just hit a mine.');
            } else if (cell.neighbouringMineCount === 0) {
                cell.isUncovered = true;
                cell.isFlagged = false;
                var cellCount = expandZeroedArrea(x, y);
                user.score += (cellCount + 1);
            } else if (!cell.isUncovered) {
                cell.isUncovered = true;
                cell.isFlagged = false;
                user.score += 1;
            }
            firstDig = false;
            updateLeaderboard();
            drawAllTheThings();
        }

        function checkNumber(x, y, user) {
            var cell = cellData[y][x];
            if (user.disqualified || !cell.isUncovered) {
                return;
            }
            var neighbours = getNeighbours(x, y);
            var count = 0;
            for (var i = 0, l = neighbours.length; i < l; ++i) {
                var otherCell = neighbours[i];
                if ((otherCell.isMine && otherCell.isUncovered) || otherCell.isFlagged) {
                    count += 1;
                }
            }
            if (count === cell.neighbouringMineCount) {
                for (var i = 0, l = neighbours.length; i < l; ++i) {
                    var otherCell = neighbours[i];
                    if (!otherCell.isUncovered && !otherCell.isFlagged) {
                        otherCell.isUncovered = true;
                        if (otherCell.isMine) {
                            otherCell.isUncovered = true;
                            otherCell.isExploded = true;
                            user.disqualified = true;
                        } else {
                            user.score += 1;
                        }
                    }
                }
                if (user.disqualified) {
                    sentMessageToChat(user.userName + ' just hit a mine.');
                }
            }
            updateLeaderboard();
            drawAllTheThings();
        }

        function toggleFlag(x, y, user) {
            var cell = cellData[y][x];
            if (user.disqualified || cell.isUncovered) {
                return;
            }
            if (!cell.isUncovered) {
                cell.isFlagged = !cell.isFlagged;
                drawAllTheThings();
                event.preventDefault();
            }
        }

        function expandZeroedArrea(x, y) {
            var count = 0;
            var cell;
            var listA = [cellData[y][x]];
            var listB;
            while (listA.length) {
                listB = [];
                for (var i = 0, l = listA.length; i < l; ++i) {
                    cell = listA[i];
                    var neighbours = getNeighbours(cell.x, cell.y);
                    for (var j = 0, m = neighbours.length; j < m; ++j) {
                        cell = neighbours[j];
                        if (!cell.isUncovered && cell.neighbouringMineCount === 0) {
                            listB.push(cell);
                        }
                        if (!cell.isUncovered) {
                            ++count;
                            cell.isFlagged = false;
                            cell.isUncovered = true;
                        }
                    }
                }
                listA = listB;
            }

            return count;
        }

        initData();
        drawAllTheThings();
    });
})();
