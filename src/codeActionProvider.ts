/*
 * This file is part of RTags Client for Visual Studio Code.
 *
 * Copyright (c) yorver
 * Copyright (c) 2018 Jonathan Miller
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

'use strict';

import { commands, languages, workspace, CancellationToken, CodeActionContext, CodeActionProvider, Command,
         Disposable, ProviderResult, Range, TextDocument, WorkspaceEdit } from 'vscode';

import { RtagsManager, runRc } from './rtagsManager';

import { SourceFileSelector, fromRtagsPosition } from './rtagsUtil';

export class RtagsCodeActionProvider implements
    CodeActionProvider,
    Disposable
{
    constructor(rtagsMgr: RtagsManager)
    {
        this.rtagsMgr = rtagsMgr;

        const runCodeActionCallback =
            (document: TextDocument, range: Range, newText: string) : Thenable<boolean> =>
            {
                let edit = new WorkspaceEdit();
                edit.replace(document.uri, range, newText);
                return workspace.applyEdit(edit);
            };

        this.disposables.push(
            languages.registerCodeActionsProvider(SourceFileSelector, this),
            commands.registerCommand(RtagsCodeActionProvider.commandId, runCodeActionCallback));
    }

    public dispose() : void
    {
        this.disposables.forEach((d) => { d.dispose(); });
    }

    public provideCodeActions(document: TextDocument,
                              range: Range,
                              _context: CodeActionContext,
                              _token: CancellationToken) :
        ProviderResult<Command[]>
    {
        if (!this.rtagsMgr.isInProject(document.uri))
        {
            return [];
        }

        const processCallback =
            (output: string) : Command[] =>
            {
                let cmds: Command[] = [];

                for (const l of output.split('\n'))
                {
                    if (l.trim().length === 0)
                    {
                        continue;
                    }
                    const [pos, length, newText] = l.split(' ');
                    const [line, col] = pos.split(':');
                    const start = fromRtagsPosition(line, col);
                    if (range.start.line !== start.line)
                    {
                        continue;
                    }
                    const end = start.translate(0, parseInt(length));
                    const currentRange = new Range(start, end);
                    const currentText = document.getText(currentRange);

                    let title = "";
                    if ((currentText.length !== 0) && (newText.length !== 0))
                    {
                        title = "Replace " + currentText + " with " + newText;
                    }
                    else if (currentText.length !== 0)
                    {
                        title = "Remove " + currentText;
                    }
                    else if (newText.length !== 0)
                    {
                        title = "Add " + newText;
                    }
                    else
                    {
                        continue;
                    }

                    const command: Command =
                    {
                        command: RtagsCodeActionProvider.commandId,
                        title: "[RTags] " + title,
                        arguments: [document, currentRange, newText]
                    };
                    cmds.push(command);
                }

                return cmds;
            };

        return runRc(["--fixits", document.fileName], processCallback);
    }

    private static readonly commandId: string = "rtags.runCodeAction";

    private rtagsMgr: RtagsManager;
    private disposables: Disposable[] = [];
}
