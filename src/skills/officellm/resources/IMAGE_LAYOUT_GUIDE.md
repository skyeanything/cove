# Image Layout Guide

This guide explains how to use the advanced image layout features in OfficeLLM, including text wrapping and multiple image arrangements.

## 1. Text Wrapping Modes

OfficeLLM supports several text wrapping modes that control how document text flows around an image.

### Supported Modes

| Mode | Description | CLI Value |
|------|-------------|-----------|
| **Inline** | Image is treated like a character in a line of text (default). | `inline` |
| **Square** | Text flows around the rectangular boundary of the image. | `square` |
| **Tight** | Text flows closely following the image's non-transparent parts. | `tight` |
| **Behind Text** | Image sits behind the text layer. | `behind` |
| **In Front of Text** | Image sits in front of the text layer, obscuring it. | `front` |
| **Top and Bottom** | Text stops above the image and resumes below it. | `topbottom` |

### Inserting an Image with Wrapping

Use the `--wrap` option with the `insert-image` command:

```bash
# Insert an image with square wrapping at the end of the document
officellm insert-image -i report.docx --image "chart.png" --wrap square

# Insert an image behind text after a specific paragraph
officellm insert-image -i report.docx --image "background.jpg" --wrap behind --after "Preface"
```

### Changing Wrapping for Existing Images

If an image is already in the document, you can change its wrap mode using its index (0-based):

```bash
# Change the first image in the document to tight wrapping
officellm set-image-wrap -i document.docx --image-index 0 --wrap tight
```

> **Note**: Converting an image from `inline` to any other mode will convert it to a "floating" image (Anchor element). Converting from floating back to `inline` will place it back into the text flow.

## 2. Inserting at a Paragraph Index

Use `--index` to insert an image after a specific paragraph by its 0-based index (as returned by `list-structure`):

```bash
# Insert after the 3rd paragraph (index 3)
officellm insert-image -i report.docx --image "chart.png" --index 3
```

## 3. Adding Captions

Use `--caption` to automatically add a caption paragraph (with Caption style) below the inserted image:

```bash
# Insert with a caption
officellm insert-image -i report.docx --image "chart.png" --caption "Sales distribution by region"

# Combined: insert at index with caption
officellm insert-image -i report.docx --image "fig1.png" --index 5 --caption "Figure: Revenue breakdown"
```

## 4. Multiple Images (Side-by-Side)

The `insert-images` command allows you to insert multiple images at once with specific layout options.

### Side-by-Side Layout

The default layout for `insert-images` is `side-by-side`, which places images horizontally within the same paragraph.

```bash
# Insert two images side-by-side
officellm insert-images -i comparison.docx --images "left.png,right.png" --layout side-by-side
```

### Spacing between Images

You can control the horizontal gap between side-by-side images using the `--spacing` option (value in EMUs, where 1 cm ≈ 360,000 EMUs).

```bash
# Insert two images with a 1cm gap (360,000 EMUs)
officellm insert-images -i comparison.docx --images "a.png,b.png" --spacing 360000
```

## 5. Best Practices

- **DPI Awareness**: OfficeLLM automatically detects image DPI to calculate appropriate physical dimensions in Word. If your images appear too large or small, check their DPI metadata.
- **Anchor Positioning**: When using wrapping modes (non-inline), images are anchored to the paragraph where they are inserted. By default, OfficeLLM centers these images horizontally.
- **Complex Layouts**: For highly complex layouts (e.g., overlapping images with specific Z-orders), consider using the `raw-xml` command to manipulate the OpenXML directly or use a batch of `set-image-wrap` and `insert-image` commands.
