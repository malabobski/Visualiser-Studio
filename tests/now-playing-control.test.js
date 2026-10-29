const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { NowPlayingControl } = require('../now-playing-control');

function helper() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdin = new EventEmitter();
  child.commands = [];
  child.stdin.write = (line, done) => { child.commands.push(JSON.parse(line)); done(); };
  child.kill = () => { child.killed = true; };
  return child;
}

test('commands reuse the warmed helper and fragmented replies reach the right caller', async () => {
  const child = helper(); let launches = 0;
  const service = new NowPlayingControl({ spawnProcess: (_command, args, options) => {
    launches++; assert(args.includes('-ControlServer')); assert(options.windowsHide); return child;
  } });
  service.start();
  const toggle = service.request('toggle'), seek = service.request('seek', 12.5);
  assert.equal(launches, 1);
  assert.equal(child.commands[1].position, 12.5);
  const replies = JSON.stringify({ id: child.commands[1].id, result: true }) + '\n' + JSON.stringify({ id: child.commands[0].id, result: false }) + '\n';
  child.stdout.emit('data', replies.slice(0, 14)); child.stdout.emit('data', replies.slice(14));
  assert.equal(await toggle, false); assert.equal(await seek, true);
  service.stop(); assert(child.killed);
});

test('invalid actions and seek positions never start a process', async () => {
  const service = new NowPlayingControl({ spawnProcess: () => { assert.fail('Invalid command launched a helper'); } });
  for (const args of [['other'], ['seek'], ['seek', NaN], ['seek', Infinity], ['seek', -1]]) {
    assert.equal(await service.request(...args), false);
  }
});

test('helper failure resolves all commands and stale events cannot stop its replacement', async () => {
  const first = helper(), second = helper(); let launches = 0;
  const service = new NowPlayingControl({ spawnProcess: () => ++launches === 1 ? first : second });
  const one = service.request('next'), two = service.request('toggle');
  first.stdin.emit('error', new Error('closed'));
  assert.equal(await one, false); assert.equal(await two, false); assert(first.killed);
  const next = service.request('previous');
  first.emit('close', 1);
  assert.equal(second.killed, undefined);
  second.stdout.emit('data', JSON.stringify({ id: second.commands[0].id, result: true }) + '\n');
  assert.equal(await next, true); service.stop();
});

test('a stalled helper times out without replaying media actions', async () => {
  const child = helper();
  const service = new NowPlayingControl({ spawnProcess: () => child, timeout: 10 });
  assert.equal(await service.request('toggle'), false);
  assert(child.killed); assert.equal(child.commands.length, 1); assert.equal(service.pending.size, 0);
});

test('PowerShell command loop executes ordered commands without polling or restarting', { skip: process.platform !== 'win32' }, () => {
  const fs = require('node:fs'), path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '../now-playing.ps1'), 'utf8');
  const script = `
    $ErrorActionPreference = 'Stop'
    $ControlServer = $true
    function Write-Line([string]$text) { [Console]::Out.WriteLine($text) }
    function Write-Diag([string]$text) { throw $text }
    function Await($operation, $resultType) { return $operation }
    $session = New-Object PSObject
    $session | Add-Member ScriptMethod TryTogglePlayPauseAsync { return $true }
    $session | Add-Member ScriptMethod TrySkipPreviousAsync { return $false }
    $session | Add-Member ScriptMethod TrySkipNextAsync { return $true }
    $session | Add-Member ScriptMethod TryChangePlaybackPositionAsync { param($ticks) return ($ticks -eq 125000000) }
    $manager = New-Object PSObject
    $manager | Add-Member ScriptMethod GetCurrentSession { return $session }
  ` + source.slice(source.indexOf('function Invoke-MediaControl'), source.indexOf('$sourceNames ='));
  const commands = [
    { id: 1, action: 'toggle' }, { id: 2, action: 'next' }, { id: 3, action: 'seek', position: 12.5 },
    { id: 4, action: 'previous' }, { id: 5, action: 'seek', position: -1 }, { id: 6, action: 'other' }
  ];
  const result = require('node:child_process').spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    input: commands.map(command => JSON.stringify(command)).join('\n') + '\n', encoding: 'utf8', windowsHide: true, timeout: 15000
  });
  assert.equal(result.status, 0, result.stderr);
  const replies = result.stdout.trim().split(/\r?\n/).map(line => JSON.parse(line));
  assert.deepEqual(replies, commands.map((command, index) => ({ id: command.id, result: index < 3 })));
});
