/**
 * Action group generation for tree object nodes.
 *
 * When a user expands a task/algorithm/data node, getObjectActions()
 * builds the View and Execute/Actions group items that appear underneath.
 */
import * as vscode from 'vscode';
import { CelebiTreeItem } from '../treeItem';
import { execPython } from '../pythonRunner';

/**
 * Build the View + Execute/Actions group items for an object node.
 * The View group always runs `.status()`.  The Execute group dispatches
 * based on objectType: submit (task), impress (algorithm), or cat (data).
 */
export async function getObjectActions(object: CelebiTreeItem): Promise<CelebiTreeItem[]> {
    const groups: CelebiTreeItem[] = [];

    // Resolve object name relative to the project root
    const projectPath = await execPython('shell.MANAGER.current_object().path');
    let objectName: string;
    if (object.objectPath === projectPath) {
        objectName = '.';
    } else if (object.objectPath.startsWith(projectPath + '/')) {
        objectName = object.objectPath.substring(projectPath.length + 1);
    } else {
        objectName = object.label;
    }

    // View group
    const viewGroup = new CelebiTreeItem(
        'View', 'object-view-group', object.objectPath,
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

    // Execute / Actions group — primary action depends on object type
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
        'exec-group', object.objectPath,
        vscode.TreeItemCollapsibleState.None,
        execCommand
    );
    execGroup.iconPath = new vscode.ThemeIcon('zap', new vscode.ThemeColor('charts.blue'));
    groups.push(execGroup);

    return groups;
}
