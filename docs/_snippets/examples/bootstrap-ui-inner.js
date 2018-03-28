/**
 * @license Copyright (c) 2003-2018, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md.
 */

/* globals $, window, console:false */

// Basic classes to create an editor.
import Editor from '@ckeditor/ckeditor5-core/src/editor/editor';
import EditorUIView from '@ckeditor/ckeditor5-ui/src/editorui/editoruiview';
import FocusTracker from '@ckeditor/ckeditor5-utils/src/focustracker';
import ComponentFactory from '@ckeditor/ckeditor5-ui/src/componentfactory';
import InlineEditableUIView from '@ckeditor/ckeditor5-ui/src/editableui/inline/inlineeditableuiview';
import HtmlDataProcessor from '@ckeditor/ckeditor5-engine/src/dataprocessor/htmldataprocessor';
import ElementReplacer from '@ckeditor/ckeditor5-utils/src/elementreplacer';

// Interfaces to extend basic Editor API.
import DataApiMixin from '@ckeditor/ckeditor5-core/src/editor/utils/dataapimixin';
import ElementApiMixin from '@ckeditor/ckeditor5-core/src/editor/utils/elementapimixin';

// Helper function for adding interfaces to the Editor class.
import mix from '@ckeditor/ckeditor5-utils/src/mix';

// Helper function that gets data from HTML element that the Editor is attached to.
import getDataFromElement from '@ckeditor/ckeditor5-utils/src/dom/getdatafromelement';

// Helper function that binds editor with HTMLForm element.
import attachToForm from '@ckeditor/ckeditor5-core/src/editor/utils/attachtoform';

// Basic features that every editor should enable.
import Clipboard from '@ckeditor/ckeditor5-clipboard/src/clipboard';
import Enter from '@ckeditor/ckeditor5-enter/src/enter';
import Typing from '@ckeditor/ckeditor5-typing/src/typing';
import Paragraph from '@ckeditor/ckeditor5-paragraph/src/paragraph';
import UndoEditing from '@ckeditor/ckeditor5-undo/src/undoediting';

// Basic features to associated with the edited content.
import BoldEditing from '@ckeditor/ckeditor5-basic-styles/src/bold/boldediting';
import ItalicEditing from '@ckeditor/ckeditor5-basic-styles/src/italic/italicediting';
import UnderlineEditing from '@ckeditor/ckeditor5-basic-styles/src/underline/underlineediting';
import HeadingEditing from '@ckeditor/ckeditor5-heading/src/headingediting';

// The easy image integration.
import EasyImage from '@ckeditor/ckeditor5-easy-image/src/easyimage';
import { CS_CONFIG } from '@ckeditor/ckeditor5-cloud-services/tests/_utils/cloud-services-config';

// Extending the Editor class, which brings base editor API.
export default class BootstrapEditor extends Editor {
	constructor( element, config ) {
		super( config );

		// Remember the element the editor is created with.
		this.element = element;

		// Use the HTML data processor in this editor.
		this.data.processor = new HtmlDataProcessor();

		// Create the ("main") root element of the model tree.
		this.model.document.createRoot();

		// The UI layer of the editor.
		this.ui = new BootstrapEditorUI( this );

		// When editor#element is a textarea inside a form element
		// then content of this textarea will be updated on form submit.
		attachToForm( this );

		// A helper to easily replace the editor#element with editor.editable#element.
		this._elementReplacer = new ElementReplacer();
	}

	destroy() {
		// When destroyed, editor sets the output of editor#getData() into editor#element...
		this.updateElement();

		// ...and restores the original editor#element...
		this._elementReplacer.restore();

		// ...and destroys the UI.
		this.ui.destroy();

		return super.destroy();
	}

	static create( element, config ) {
		return new Promise( resolve => {
			const editor = new this( element, config );
			const editable = editor.ui.view.editable;

			resolve(
				editor.initPlugins()
					.then( () => {
						// Initialize the UI first. See the BootstrapEditorUI class to learn more.
						editor.ui.init();

						// Replace the editor#element with editor.editable#element.
						editor._elementReplacer.replace( element, editable.element );

						// Tell the world that the UI of the editor is ready to use.
						editor.fire( 'uiReady' );
					} )
					// Bind the editor editing layer to the editable in DOM.
					.then( () => editor.editing.view.attachDomRoot( editable.element ) )
					// Fill the editable with the initial data.
					.then( () => editor.data.init( getDataFromElement( element ) ) )
					// Fire the events that announce that the editor is complete and ready to use.
					.then( () => {
						editor.fire( 'dataReady' );
						editor.fire( 'ready' );
					} )
					.then( () => editor )
			);
		} );
	}
}

// Mixing interfaces, which extends basic editor API.
mix( BootstrapEditor, DataApiMixin );
mix( BootstrapEditor, ElementApiMixin );

// The class organizing the UI of the editor, binding it with existing Bootstrap elements in DOM.
class BootstrapEditorUI {
	constructor( editor ) {
		this.editor = editor;

		// The global UI view of the editor. It aggregates various Bootstrap DOM elements.
		const view = this.view = new EditorUIView( editor.locale );

		// This is the main editor element in DOM.
		view.element = $( '.ck-editor' );

		// This is the editable view in DOM. It will replace the data container in DOM.
		view.editable = new InlineEditableUIView( editor.locale );

		// References to the dropdown elements for further usage. See #_setupBootstrapHeadingDropdown.
		view.dropdownMenu = view.element.find( '.dropdown-menu' );
		view.dropdownToggle = view.element.find( '.dropdown-toggle' );

		// References to the toolbar buttons for further usage. See #_setupBootstrapToolbarButtons.
		view.toolbarButtons = {};

		[ 'bold', 'italic', 'underline', 'undo', 'redo' ].forEach( name => {
			// Retrieve the jQuery object corresponding with the button in DOM.
			view.toolbarButtons[ name ] = view.element.find( `#${ name }` );
		} );

		// Mandatory EditorUI interface components.
		this.componentFactory = new ComponentFactory( editor );
		this.focusTracker = new FocusTracker();
	}

	init() {
		const editor = this.editor;
		const view = this.view;

		// Render the editable component in DOM first.
		view.editable.render();

		// Create an editing root in the editing layer. It will correspond with the
		// document root created in the constructor().
		const editingRoot = editor.editing.view.document.getRoot();

		// Bind the basic attributes of the editable in DOM with the editing layer.
		view.editable.bind( 'isReadOnly' ).to( editingRoot );
		view.editable.bind( 'isFocused' ).to( editor.editing.view.document );
		view.editable.name = editingRoot.rootName;

		// Setup the existing, external Bootstrap UI so it works with the rest of the editor.
		this._setupBootstrapToolbarButtons();
		this._setupBootstrapHeadingDropdown();
	}

	destroy() {
		this.view.editable.destroy();
	}

	// This method activates Bold, Italic, Underline, Undo and Redo buttons in the toolbar.
	_setupBootstrapToolbarButtons() {
		const editor = this.editor;

		for ( const name in this.view.toolbarButtons ) {
			// Retrieve the editor command corresponding with the id of the button in DOM.
			const command = editor.commands.get( name );
			const button = this.view.toolbarButtons[ name ];

			// Clicking on the buttons should execute the editor command...
			button.click( () => editor.execute( name ) );

			// ...but it should not steal the focus so the editing is uninterrupted.
			button.mousedown( evt => evt.preventDefault() );

			const onValueChange = () => {
				button.toggleClass( 'active', command.value );
			};

			const onIsEnabledChange = () => {
				button.attr( 'disabled', () => !command.isEnabled );
			};

			// Commands can become disabled, e.g. when the editor is read-only.
			// Make sure the buttons reflect this state change.
			command.on( 'change:isEnabled', onIsEnabledChange );
			onIsEnabledChange();

			// Bold, Italic and Underline commands have a value that changes
			// when the selection starts in an element the command creates.
			// The button should indicate that e.g. editing text which is already bold.
			if ( !new Set( [ 'undo', 'redo' ] ).has( name ) ) {
				command.on( 'change:value', onValueChange );
				onValueChange();
			}
		}
	}

	// This method activates the headings dropdown in the toolbar.
	_setupBootstrapHeadingDropdown() {
		const editor = this.editor;
		const dropdownMenu = this.view.dropdownMenu;
		const dropdownToggle = this.view.dropdownToggle;

		// Retrieve the editor commands for heading and paragraph.
		const headingCommand = editor.commands.get( 'heading' );
		const paragraphCommand = editor.commands.get( 'paragraph' );

		// Create a dropdown menu entry for each heading configuration option.
		editor.config.get( 'heading.options' ).map( option => {
			// Check is options is paragraph or heading as their commands slightly differ.
			const isParagraph = option.model === 'paragraph';

			// Create the menu item DOM element.
			const menuItem = $(
				`<a href="#" class="dropdown-item heading-item_${ option.model }">` +
					`${ option.title }` +
				'</a>'
			);

			// Upon click, the dropdown menu item should execute the command and focus
			// the editing view to keep the editing process uninterrupted.
			menuItem.click( () => {
				const commandName = isParagraph ? 'paragraph' : 'heading';
				const commandValue = isParagraph ? undefined : { value: option.model };

				editor.execute( commandName, commandValue );
				editor.editing.view.focus();
			} );

			dropdownMenu.append( menuItem );

			const command = isParagraph ? paragraphCommand : headingCommand;

			// Make sure the dropdown and its items reflect the state of the
			// currently active command.
			const onValueChange = isParagraph ? onValueChangeParagraph : onValueChangeHeading;
			command.on( 'change:value', onValueChange );
			onValueChange();

			// Heading commands can become disabled, e.g. when the editor is read-only.
			// Make sure the UI reflects this state change.
			command.on( 'change:isEnabled', onIsEnabledChange );

			onIsEnabledChange();

			function onValueChangeHeading() {
				const isActive = !isParagraph && command.value === option.model;

				if ( isActive ) {
					dropdownToggle.children( ':first' ).text( option.title );
				}

				menuItem.toggleClass( 'active', isActive );
			}

			function onValueChangeParagraph() {
				if ( command.value ) {
					dropdownToggle.children( ':first' ).text( option.title );
				}

				menuItem.toggleClass( 'active', command.value );
			}

			function onIsEnabledChange() {
				dropdownToggle.attr( 'disabled', () => !command.isEnabled );
			}
		} );
	}
}

// Finally, create the BootstrapEditor instance with a selected set of features.
BootstrapEditor
	.create( $( '#editor' ).get( 0 ), {
		plugins: [
			Clipboard, Enter, Typing, Paragraph, EasyImage,
			BoldEditing, ItalicEditing, UnderlineEditing, HeadingEditing, UndoEditing
		],
		cloudServices: CS_CONFIG
	} )
	.then( editor => {
		window.editor = editor;

		$( '#toggle-readonly' ).on( 'click', () => {
			editor.isReadOnly = !editor.isReadOnly;
		} );
	} )
	.catch( err => {
		console.error( err.stack );
	} );
