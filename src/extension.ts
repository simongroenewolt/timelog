// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

//
// generic functionality
//
var DAYS = [
	'Sunday',
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday',
];

var MONTHS = [
	'Jan',
	'Feb',
	'Mar',
	'Apr',
	'May',
	'Jun',
	'Jul',
	'Aug',
	'Sep',
	'Oct',
	'Nov',
	'Dec',
];

function pad(number: number) {
	if (number < 10) {
		return "0" + number;
	}
	return "" + number;
}

function toHoursAndMinutes(totalMinutes: number) {
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;

	return `${pad(hours)}:${pad(minutes)}`;
}

function formatDate(now: Date) {
	const days = DAYS;
	const months = MONTHS;
	return days[now.getDay()] + " " + months[now.getMonth()] + " " + pad(now.getDate()) + " " +
		now.getFullYear() + " " +
		pad(now.getHours()) + ":" + pad(now.getMinutes());
}

function generateMarker(now: Date) {
	var dateMarker = "[" + formatDate(now) + "] ";
	return dateMarker;
}

/**
 * @param line
 * @return object with 'date', 'originalDateString', and optional 'label' property, or undefined if no marker found
 */
function parseLine(line: string) {
	if (line.startsWith('[')) {
		var matches = line.match(/\[(.+)\]\s*([^\s]*)/);
		if (matches !== null && matches.length === 3) {
			var dateStamp = matches[1];
			var projectMarker = matches[2];

			// try to create a date from the dateStamp
			var dateParts = dateStamp.match(/(\w+) (\w+) (\d+) (\d+) (\d+):(\d+)/);
			// ["Sunday Apr 30 2023 16:36", "Sunday", "Apr", "30", "2023", "16", "36"]
			if (dateParts !== null && dateParts.length === 7) {
				// Note: we don't need the day in dateParts[1] to parse the date correctly
				var monthIdx = MONTHS.indexOf(dateParts[2]);
				var monthDay = Number.parseInt(dateParts[3], 10);
				var year = Number.parseInt(dateParts[4], 10);
				var hours = Number.parseInt(dateParts[5], 10);
				var minutes = Number.parseInt(dateParts[6], 10);

				var d = new Date();
				d.setMonth(monthIdx);
				d.setDate(monthDay);
				d.setFullYear(year);
				d.setHours(hours);
				d.setMinutes(minutes);

				return { date: d, label: projectMarker, originalDateString: dateStamp };
			}
		}
	}
	// no valid marker found on this line
	return undefined;
}

function sameDate(date1: Date, date2: Date) {
	return (
		date1.getFullYear() === date2.getFullYear() &&
		date1.getMonth() === date2.getMonth() &&
		date1.getDate() === date2.getDate()
	);
}

function processLines(lines: string[]) {
	var firstDate = undefined;
	var lastDate = undefined;
	var activeProject = undefined;
	var projects: { [key: string]: { from: Date, to: Date, duration: number }[] } = {};
	const errors = [];
	for (var line of lines) {

		const marker = parseLine(line);
		if (marker !== undefined) {
			if (activeProject !== undefined) {
				if (!projects.hasOwnProperty(activeProject)) {
					projects[activeProject] = [];
				}

				if (lastDate !== undefined) {
					// get difference, store time with currentProject

					// check if time is reversed!
					// add error if that is the case
					if (marker.date.getTime() < lastDate.getTime()) {
						errors.push(`Timestamp '${marker.originalDateString}' is not after the previous one.`);
					}

					projects[activeProject].push({
						from: lastDate,
						to: marker.date,
						duration: Math.floor((marker.date.getTime() - lastDate.getTime()) / (1000 * 60)), // in minutes
					});
				}
			}

			if (lastDate === undefined) {
				// store the first date ever found
				firstDate = marker.date;
			}
			// store this dateStamp for the next line
			lastDate = marker.date;
			activeProject = marker.label;
		}
	}
	console.log(projects);
	return { firstDate, lastDate, projects, errors };
}

//
// end generic functionality
//

class ProjectsViewProvider implements vscode.WebviewViewProvider {

	public static readonly viewType = 'timelog.projects-view';

	private _view?: vscode.WebviewView;

	constructor(
		private readonly _extensionUri: vscode.Uri,
	) { }

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		this._view = webviewView;

		webviewView.webview.options = {
			// Allow scripts in the webview
			enableScripts: true,

			localResourceRoots: [
				this._extensionUri
			]
		};

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

		webviewView.webview.onDidReceiveMessage(data => {
			// console.log('Extension onDidReceiveMessage ', data.type);
			if (data.type === 'moveSelection') {
				const editor = vscode.window.activeTextEditor;
				if (editor !== undefined) {
					if (editor.selections.length > 1) {
						// warn/error!
						vscode.window.showErrorMessage('Timelog cannot handle multiple selections');
					} else {
						if (data.value === 'backward') {
							console.log('received backward message');

							// move cursur to start of current selection, then search backwards
							const newCursorPosition = new vscode.Position(
								editor.selection.start.line,
								Math.max(0, editor.selection.start.character - 1)
							);
							// start and end the same = just cursor, no selection
							const newSelection = new vscode.Selection(newCursorPosition, newCursorPosition);
							editor.selection = newSelection;
							vscode.commands.executeCommand("timelog.parseAndShow");

						} else {
							// assuming forward
							console.log('received forward message');

							// move cursur to end of current selection, then search forwards
							const newCursorPosition = new vscode.Position(
								editor.selection.end.line,
								editor.selection.end.character
							);
							// start and end the same = just cursor, no selection
							const newSelection = new vscode.Selection(newCursorPosition, newCursorPosition);
							editor.selection = newSelection;

							vscode.commands.executeCommand("timelog.parseAndShow", 'forward');
						}
					}
				} else {
					vscode.window.showErrorMessage('Timelog no active editor found');
				}
			} else if (data.type === 'insertMarker') {
				vscode.commands.executeCommand("timelog.placeMark");
			}
		});
	}

	public updateProjects(data:
		{
			usingSelection: boolean,
			errors: string[],
			summary?: {
				from: string,
				to: string,
			},
			projects:
			{
				name: string,
				time: number,
				intervals:
				{
					from: Date,
					to: Date,
					duration: number
				}[]
			}[]
		}
	) {
		if (this._view) {
			this._view.show?.(true); // `show` is not implemented in 1.49 but is for 1.50 insiders
			this._view.webview.postMessage({ type: 'updateProjects', data });
		} else {
			console.log('extension is missing _view');
		}
	}

	public clearProjects() {
		if (this._view) {
			this._view.webview.postMessage({ type: 'clearProjects' });
		}
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		// Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js'));

		// Do the same for the stylesheet.
		const styleResetUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'reset.css'));
		const styleVSCodeUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'vscode.css'));
		const styleMainUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.css'));

		// Use a nonce to only allow a specific script to be run.
		const nonce = getNonce();

		return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<!--
					Use a content security policy to only allow loading styles from our extension directory,
					and only allow scripts that have a specific nonce.
					(See the 'webview-sample' extension sample for img-src content security policy examples)
				-->
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<link href="${styleResetUri}" rel="stylesheet">
				<link href="${styleVSCodeUri}" rel="stylesheet">
				<link href="${styleMainUri}" rel="stylesheet">
				<title>Cat Colors</title>
			</head>
			<body>
				<div class="top-buttons">
					<button class="mark-button">insert marker</button>
				</div>
				<div class="timelog-summary">
				</div>
				<div class="timelog-projects">
				<table>
					<thead>
						<tr><th>project</th><th>time</th></tr>
					</thead>
					<tbody class="project-list"></tbody>
				</table>
				</div>
				<div class="timelog-errors">
				errors content (to be replaced)
				</div>
				<div class="nav-buttons">
					<button class="prev-button">back</button>
					<button class="next-button">forward</button>
				</div>
				<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>`;
	}
}

function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

function searchSameDay(document: vscode.TextDocument, currentLineIdx: number, backward: boolean): {lineIdx: number, lines: string[]} {
	let firstFoundDate = undefined;
	let lines: string[] = [];
	while (true) {
		const line = document.lineAt(currentLineIdx).text;
		const parsed = parseLine(line);
		// console.log(currentLineIdx, parsed, firstFoundDate);
		if (parsed !== undefined) {
			if (firstFoundDate === undefined) {
				firstFoundDate = parsed.date;
			} else {
				if (!sameDate(firstFoundDate, parsed.date)) {
					// don't include this line, and stop
					if (backward) {
						currentLineIdx += 1;
					} else {
						currentLineIdx -= 1;
					}
					break;
				}
			}
		}

		// add line to lines array to be parsed (again!) later
		if (backward) {
			lines.unshift(line);
			if (currentLineIdx === 0) {
				break;
			}
			currentLineIdx -= 1;
		} else {
			lines.push(line);
			if (currentLineIdx === document.lineCount - 1) {
				break;
			}
			currentLineIdx += 1;
		}
		
	}
	return {lineIdx: currentLineIdx, lines};
}

const simpleStringCompare = (a: string, b: string) => {
	a = a.toLowerCase();
	b = b.toLowerCase();
	if (a > b) { 
		return 1;
	} else if ( a < b) {
		return -1;
	}
	return 0;
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('extension "timelog" is now active!');

	const provider = new ProjectsViewProvider(context.extensionUri);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(ProjectsViewProvider.viewType, provider));

	// let disposable2 = vscode.commands.registerCommand('timelog.placeMark', () => {
	let disposable2 = vscode.commands.registerTextEditorCommand('timelog.placeMark', (editor: vscode.TextEditor, edit) => {
		let text = generateMarker(new Date());
		// vscode.window.showInformationMessage('placeMark from timelog: ' + text + ' editor selections: ' + editor.selections.length);
		// vscode.window.showInformationMessage('placeMark selections: ' + editor.selections.length);

		// the user can potentially have multiple selections/cursors active, and while
		// marking this is a bit silly, but still ok to do (parsing will _not_ work with multiple selections)
		editor.selections.forEach((selection, i) => {

			edit.insert(selection.active, text);  // insert at current cursor
		});

	});

	context.subscriptions.push(disposable2);

	let disposable3 = vscode.commands.registerTextEditorCommand(
		'timelog.parseAndShow', 
		(editor: vscode.TextEditor, edit, ...args) => {
		// vscode.window.showInformationMessage('parseAndShow from timelog!');
		// console.log('parseAndShow from timelog!', args

		const backward = !(args.length > 0 && args[0] === 'forward');

		// the user can potentially have multiple selections/cursors active
		if (editor.selections.length > 1) {
			vscode.window.showErrorMessage('Timelog cannot parse multiple selections');
		}
		let lines;
		let usingSelection = true;
		if (editor.selection.start.isEqual(editor.selection.end)) {
			// console.log('no selection, just a cursor');

			lines = [];
			// no selection - try to select text for the day the cursor is _after_ by searching backwards
			// stopping when the markers are from the previous day
			usingSelection = false;
			const cursorPos = editor.selection.active;
			const document = editor.document;
			let currentLineIdx = cursorPos.line;

			const sameDay = searchSameDay(document, currentLineIdx, backward);

			// TODO make 'autoselect' configurable later, or is this always the desired behavior?
			const autoselect = true;
			if (autoselect) {
				// set selection
				editor.selection = new vscode.Selection(new vscode.Position(sameDay.lineIdx, 0), cursorPos);
			}
			lines = sameDay.lines;
		} else {
			lines = editor.document.getText(editor.selection).split(/[\n\r]+/);

		}
		const processed = processLines(lines);
		// console.log(processed);

		const projects = processed.projects;
		const firstDate = processed.firstDate;
		const lastDate = processed.lastDate;
		const errors = processed.errors;
		const viewModel = Object.keys(projects).sort((a, b) => {
			if (a.startsWith('*')) {
				if (b.startsWith('*')) {
					return simpleStringCompare(a, b);
				} else {
					return 1; 
				}
			} if (b.startsWith('*')) {
				return -1;
			}
			return simpleStringCompare(a, b);
		}).map(projectName => {
			const intervals = projects[projectName];
			let total = 0;
			for (const interval of intervals) {
				total += interval.duration;
			}
			return { name: projectName, time: total, intervals };
		});

		let summary = undefined;
		if (Object.keys(projects).length > 0 && firstDate !== undefined && lastDate !== undefined) {
			summary = {
				from: formatDate(firstDate),
				to: formatDate(lastDate),
			};
		}

		provider.updateProjects({
			usingSelection,
			errors,
			summary,
			projects: viewModel,
		});
	});

	context.subscriptions.push(disposable3);

}

// This method is called when your extension is deactivated
export function deactivate() { }
