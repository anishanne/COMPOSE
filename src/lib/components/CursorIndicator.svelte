<script>
	import { onMount, onDestroy } from "svelte";
	
	export let editor;
	export let fieldElement;
	
	let cursorElement = null;
	let cursorPosition = { top: 0, left: 0 };
	let updateInterval = null;
	
	function getUserColor(userId) {
		if (!userId) return "#000000";
		let hash = 0;
		for (let i = 0; i < userId.length; i++) {
			hash = userId.charCodeAt(i) + ((hash << 5) - hash);
		}
		const hue = hash % 360;
		return `hsl(${hue}, 70%, 50%)`;
	}
	
	$: userColor = getUserColor(editor?.user_id);

	function updateCursorPosition() {
		if (!fieldElement || !editor) {
			cursorPosition = { top: 0, left: 0 };
			return;
		}
		
		const textarea = fieldElement;
		const text = textarea.value || "";
		const cursorPos = Math.min(editor.cursor_position || 0, text.length);
		
		const scrollTop = textarea.scrollTop || 0;
		const scrollLeft = textarea.scrollLeft || 0;

		if (cursorPos === 0 && text.length === 0) {
			const rect = textarea.getBoundingClientRect();
			const style = window.getComputedStyle(textarea);
			const paddingTop = parseFloat(style.paddingTop) || 0;
			const paddingLeft = parseFloat(style.paddingLeft) || 0;
			
			cursorPosition = {
				top: rect.top + paddingTop + 2 - scrollTop,
				left: rect.left + paddingLeft - scrollLeft
			};
			return;
		}
		
		const measureDiv = document.createElement("div");
		const style = window.getComputedStyle(textarea);
		
		measureDiv.style.position = "absolute";
		measureDiv.style.visibility = "hidden";
		measureDiv.style.whiteSpace = "pre-wrap";
		measureDiv.style.wordWrap = "break-word";
		measureDiv.style.font = style.font;
		measureDiv.style.fontSize = style.fontSize;
		measureDiv.style.fontFamily = style.fontFamily;
		measureDiv.style.fontWeight = style.fontWeight;
		measureDiv.style.letterSpacing = style.letterSpacing;
		measureDiv.style.padding = style.padding;
		measureDiv.style.border = style.border;
		measureDiv.style.width = style.width;
		measureDiv.style.boxSizing = style.boxSizing;
		
		measureDiv.textContent = text.substring(0, cursorPos);
		
		document.body.appendChild(measureDiv);
		
		const textareaRect = textarea.getBoundingClientRect();
		const measureRect = measureDiv.getBoundingClientRect();
		
		const rect = textarea.getBoundingClientRect();
		const paddingTop = parseFloat(style.paddingTop) || 0;
		const paddingLeft = parseFloat(style.paddingLeft) || 0;
		
		const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
		
		const textBeforeCursor = text.substring(0, cursorPos);
		const lines = textBeforeCursor.split("\n");
		const lineNumber = lines.length - 1;
		
		const currentLineText = lines[lines.length - 1] || "";
		const lineMeasureDiv = document.createElement("div");
		lineMeasureDiv.style.position = "absolute";
		lineMeasureDiv.style.visibility = "hidden";
		lineMeasureDiv.style.whiteSpace = "pre";
		lineMeasureDiv.style.font = style.font;
		lineMeasureDiv.textContent = currentLineText;
		document.body.appendChild(lineMeasureDiv);
		const lineWidth = lineMeasureDiv.offsetWidth;
		document.body.removeChild(lineMeasureDiv);
		
		let topPosition = rect.top + paddingTop + (lineNumber * lineHeight) + 2 - scrollTop;
		let leftPosition = rect.left + paddingLeft + lineWidth - scrollLeft;

		const maxTop = rect.top + rect.height - scrollTop - lineHeight;
		const minTop = rect.top - scrollTop;
		topPosition = Math.min(Math.max(topPosition, minTop), maxTop);

		const maxLeft = rect.left + rect.width - scrollLeft;
		const minLeft = rect.left - scrollLeft;
		leftPosition = Math.min(Math.max(leftPosition, minLeft), maxLeft);

		cursorPosition = {
			top: topPosition,
			left: leftPosition
		};
		
		document.body.removeChild(measureDiv);
	}
	
	$: if (fieldElement && editor) {
		updateCursorPosition();
	}
	
	$: if (editor?.cursor_position !== undefined) {
		updateCursorPosition();
	}
	
	onMount(() => {
		if (fieldElement && editor) {
			updateCursorPosition();
			updateInterval = setInterval(updateCursorPosition, 100);
		}
	});
	
	onDestroy(() => {
		if (updateInterval) {
			clearInterval(updateInterval);
		}
	});
</script>

{#if fieldElement && editor && cursorPosition}
	<div
		bind:this={cursorElement}
		class="cursor-indicator"
		style="top: {cursorPosition.top}px; left: {cursorPosition.left}px; border-color: {userColor};"
	>
		<div class="cursor-line" style="background-color: {userColor};"></div>
		<div class="cursor-label" style="background-color: {userColor};">
			{editor.users?.full_name || editor.users?.initials || editor.users?.email || "User"}
		</div>
	</div>
{/if}

<style>
	.cursor-indicator {
		position: fixed;
		pointer-events: none;
		z-index: 1000;
		transition: top 0.1s, left 0.1s;
	}
	
	.cursor-line {
		width: 2px;
		height: 20px;
		position: absolute;
		top: 0;
		left: 0;
		animation: blink 1s infinite;
	}
	
	.cursor-label {
		position: absolute;
		top: -24px;
		left: -2px;
		padding: 2px 6px;
		border-radius: 4px;
		font-size: 11px;
		color: white;
		font-weight: 600;
		white-space: nowrap;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
	}
	
	@keyframes blink {
		0%, 50% { opacity: 1; }
		51%, 100% { opacity: 0.3; }
	}
</style>

