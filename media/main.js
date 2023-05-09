//@ts-check

// This script will be run within the webview itself
// It cannot access the main VS Code APIs directly.
(function () {
    // @ts-ignore
    const vscode = acquireVsCodeApi();

    // TODO in the future: actually use the old state -- but do we need that?
    const oldState = vscode.getState() || { data: {} };

    /**
     * @param {number} value
     */
    function pad(value) {
        if (value < 10) {
            return "0" + value;
        }
        return "" + value;
    }

    /**
     * @param {number} totalMinutes 
     * @returns string in format hh:mm
     */
    function toHoursAndMinutes(totalMinutes) {
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;

        return `${pad(hours)}:${pad(minutes)}`;
    }

    // /** @type {Array<{ value: string }>} */
    // let colors = oldState.colors;

    function selectBackward() {
        vscode.postMessage({ type: 'moveSelection', value: 'backward' });
    }

    function selectForward() {
        vscode.postMessage({ type: 'moveSelection', value: 'forward' });
    }

    function insertMarker() {
        vscode.postMessage({ type: 'insertMarker'});
    }

    if (document !== null) {
        const prevButton = document.querySelector('.prev-button')
        if (prevButton !== null) {
            prevButton.addEventListener('click', () => {
                selectBackward();
            });
        }
        const nextButton = document.querySelector('.next-button');
        if (nextButton !== null) {
            nextButton.addEventListener('click', () => {
                selectForward();
            });
        }
        const markButton = document.querySelector('.mark-button');
        if (markButton !== null) {
            markButton.addEventListener('click', () => {
                insertMarker();
            });
        }
    }

    // Handle messages sent from the extension to the webview
    window.addEventListener('message', event => {
        const message = event.data; // The json data that the extension sent
        switch (message.type) {
            case 'updateProjects':
                {
                    updateProjects(message.data);
                    break;
                }

        }
        // later more?
    });

    function updateProjects(data) {

        console.log('updateProjects received', data);

        // add summary
        const summaryContainer = document.querySelector('.timelog-summary');
        if (summaryContainer !== null && data.summary !== undefined) {
            summaryContainer.innerHTML = `<dl>
                <dt>from</dt>
                <dd>${data.summary.from}</dd>
                <dt>to</dt>
                <dd>${data.summary.to}</dd>
            </dl>`;
        }

        // add projects
        const container = document.querySelector('.project-list');
        if (container !== null) {
            container.textContent = '';
            for (const project of data.projects) {
                const row = document.createElement('tr');
                row.className = 'project-entry';

                // const colorPreview = document.createElement('div');
                // colorPreview.className = 'color-preview';
                // colorPreview.style.backgroundColor = `#${color.value}`;
                // colorPreview.addEventListener('click', () => {
                //     onColorClicked(color.value);
                // });
                // li.appendChild(colorPreview);

                // const input = document.createElement('input');
                // input.className = 'color-input';
                // input.type = 'text';
                // input.value = color.value;
                // input.addEventListener('change', (e) => {
                //     const value = e.target.value;
                //     if (!value) {
                //         // Treat empty value as delete
                //         colors.splice(colors.indexOf(color), 1);
                //     } else {
                //         color.value = value;
                //     }
                //     updateColorrowst(colors);
                // });

                const projectElement = document.createElement('td');
                const timeElement = document.createElement('td');
                projectElement.innerText = project.name;
                projectElement.className = 'project-label';
                timeElement.innerText = `${toHoursAndMinutes(project.time)}`;
                timeElement.className = 'project-time';
                row.appendChild(projectElement);
                row.appendChild(timeElement);

                container.appendChild(row);
            }
        }

        // add errors
        const errorsContainer = document.querySelector('.timelog-errors');
        if (errorsContainer !== null) {
            errorsContainer.textContent = '';
            if (data.errors && data.errors.length > 0) {
                for (const errorMessage of data.errors) {
                    const itemElement = document.createElement('div');
                    itemElement.innerText = errorMessage;
                    errorsContainer.appendChild(itemElement);
                }
            }
        } else {
            console.error('.timelog-errors not found');
        }

        // Update the saved state
        vscode.setState({ data });
    }
    /** 
    //  * @param {string} color 
    //  */
    // function onColorClicked(color) {
    //     vscode.postMessage({ type: 'colorSelected', value: color });
    // }

    // /**
    //  * @returns string
    //  */
    // function getNewCalicoColor() {
    //     const colors = ['020202', 'f1eeee', 'a85b20', 'daab70', 'efcb99'];
    //     return colors[Math.floor(Math.random() * colors.length)];
    // }

    // function addColor() {
    //     colors.push({ value: getNewCalicoColor() });
    //     updateColorList(colors);
    // }
}());


