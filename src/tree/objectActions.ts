import * as vscode from 'vscode';
import { CelebiTreeItem } from '../treeItem';
import { execPython } from '../pythonRunner';

export async function getObjectActions(object: CelebiTreeItem): Promise<CelebiTreeItem[]> {
    const groups: CelebiTreeItem[] = [];

    const projectPath = await execPython('shell.MANAGER.current_object().path');
    let objectName: string;
    if (object.objectPath === projectPath) {
        objectName = '.';
    } else if (object.objectPath.startsWith(projectPath + '/')) {
        objectName = object.objectPath.substring(projectPath.length + 1);
    } else {
        objectName = object.label;
    }

    const viewGroup = new CelebiTreeItem(
        'View',
        'object-view-group',
        object.objectPath,
        vscode.TreeItemCollapsibleState.None,
        {
            title: 'Status',
            command: 'celebi.runPythonPackage',
            arguments: [`shell.MANAGER.sub_object('${objectName}').status()`],
            tooltip: 'Status'
        }
    );
    viewGroup.iconPath = new vscode.ThemeIcon('preview', new vscode.ThemeColor('icon.foreground'));
    groups.push(viewGroup);

    let execCommand: vscode.Command | undefined;
    if (object.objectType === 'task') {
        execCommand = {
            title: 'Submit',
            command: 'celebi.runPythonPackage',
            arguments: [`shell.MANAGER.sub_object('${objectName}').submit()`],
            tooltip: 'Submit'
        };
    } else if (object.objectType === 'algorithm') {
        execCommand = {
            title: 'Impress',
            command: 'celebi.runPythonPackage',
            arguments: [`shell.MANAGER.sub_object('${objectName}').impress()`],
            tooltip: 'Impress'
        };
    } else if (object.objectType === 'data') {
        execCommand = {
            title: 'Cat',
            command: 'celebi.runPythonPackage',
            arguments: [`shell.MANAGER.sub_object('${objectName}').cat()`],
            tooltip: 'Cat'
        };
    }

    const execGroup = new CelebiTreeItem(
        object.objectType === 'task' ? 'Execute' : 'Actions',
        'exec-group',
        object.objectPath,
        vscode.TreeItemCollapsibleState.None,
        execCommand
    );
    execGroup.iconPath = new vscode.ThemeIcon('zap', new vscode.ThemeColor('charts.blue'));
    groups.push(execGroup);

    return groups;
}
