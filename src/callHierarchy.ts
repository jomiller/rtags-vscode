'use strict';

import { commands, window, workspace, Disposable, Event, EventEmitter, Location, Position, ProviderResult,
         TextDocument, TreeDataProvider, TreeItem, TreeItemCollapsibleState, Uri } from 'vscode';

import { basename } from 'path';

import { Nullable, setContext, fromRtagsLocation, toRtagsLocation, jumpToLocation, runRc } from './rtagsUtil';

interface Caller
{
    location: Location;
    containerName: string;
    containerLocation: Location;
    document?: TextDocument;
}

function getCallers(document: TextDocument | undefined, uri: Uri, position: Position) : Thenable<Caller[]>
{
    const location = toRtagsLocation(uri, position);

    const args =
    [
        "--json",
        "--absolute-path",
        "--no-context",
        "--containing-function",
        "--containing-function-location",
        "--references",
        location
    ];

    const processCallback =
        (output: string) : Caller[] =>
        {
            let callers: Caller[] = [];

            const jsonObj = JSON.parse(output);

            for (const c of jsonObj)
            {
                try
                {
                    const containerLocation = fromRtagsLocation(c.cfl);
                    const doc = workspace.textDocuments.find(
                        (val) => { return (val.uri.fsPath === containerLocation.uri.fsPath); });

                    const caller: Caller =
                    {
                        location: fromRtagsLocation(c.loc),
                        containerName: c.cf.trim(),
                        containerLocation: containerLocation,
                        document: doc
                    };
                    callers.push(caller);
                }
                catch (_err)
                {
                }
            }

            return callers;
        };

    return runRc(args, processCallback, document);
}

export class CallHierarchyProvider implements TreeDataProvider<Caller>, Disposable
{
    constructor()
    {
        const callHierarchyCallback =
            () : void =>
            {
                setContext("extension.rtags.callHierarchyVisible", true);
                this.refresh();
            };

        const closeCallHierarchyCallback =
            () : void =>
            {
                setContext("extension.rtags.callHierarchyVisible", false);
                this.refresh();
            };

        const gotoLocationCallback =
            (caller: Caller) : void =>
            {
                jumpToLocation(caller.location.uri, caller.location.range);
            };

        const showCallersCallback =
            () : void =>
            {
                const editor = window.activeTextEditor;
                if (editor)
                {
                   const document = editor.document;
                   const position = editor.selection.active;
                   let promise = getCallers(document, document.uri, position);

                   promise.then(
                       (callers: Caller[]) : void =>
                       {
                           let locations: Location[] = [];
                           callers.forEach((c) => { locations.push(c.location); });
                           commands.executeCommand("editor.action.showReferences",
                                                   document.uri,
                                                   position,
                                                   locations);
                       });
                }
            };

        this.disposables.push(
            window.registerTreeDataProvider("rtags.callHierarchy", this),
            commands.registerCommand("rtags.callHierarchy", callHierarchyCallback),
            commands.registerCommand("rtags.closeCallHierarchy", closeCallHierarchyCallback),
            commands.registerCommand("rtags.gotoLocation", gotoLocationCallback),
            commands.registerCommand("rtags.showCallers", showCallersCallback));
    }

    dispose() : void
    {
        for (let d of this.disposables)
        {
            d.dispose();
        }
    }

    getTreeItem(caller: Caller) : TreeItem | Thenable<TreeItem>
    {
        const location: string = basename(caller.location.uri.fsPath) + ':' + (caller.location.range.start.line + 1);
        let treeItem = new TreeItem(caller.containerName + " (" + location + ')', TreeItemCollapsibleState.Collapsed);
        treeItem.contextValue = "rtagsLocation";
        return treeItem;
    }

    getChildren(node?: Caller) : ProviderResult<Caller[]>
    {
        if (!node)
        {
            const list: Caller[] = [];
            const editor = window.activeTextEditor;
            if (editor)
            {
                const pos = editor.selection.active;
                const doc = editor.document;
                const loc = new Location(doc.uri, pos);

                const caller: Caller =
                {
                    location: loc,
                    containerLocation: loc,
                    containerName: doc.getText(doc.getWordRangeAtPosition(pos)),
                    document: doc
                };
                list.push(caller);
            }
            return list;
        }

        return getCallers(node.document, node.containerLocation.uri, node.containerLocation.range.start);
    }

    private refresh() : void
    {
        this.onDidChangeEmitter.fire();
    }

    private disposables: Disposable[] = [];
    private onDidChangeEmitter: EventEmitter<Nullable<Caller>> = new EventEmitter<Nullable<Caller>>();
    readonly onDidChangeTreeData: Event<Nullable<Caller>> = this.onDidChangeEmitter.event;
}
