import { useState, useEffect } from 'react';

function SelectableTagContainer({ tags, containerSelectionType = "explicit", updateTagState }) {
    // containerSelectionType one of "explicit" (for tags) or "include" (for dates)

    const [tagSelectionType, setTagSelectionType] = useState(new Map());

    function handleTagClick(tag) {

        if (containerSelectionType === "explicit") {
            let currentSelectionType = tagSelectionType.get(tag);
            let newSelectionType;
            switch (currentSelectionType) {
                case "require":
                    newSelectionType = "include";
                    break;
                case "include":
                    newSelectionType = "exclude";
                    break;
                case "exclude":
                    newSelectionType = "";
                    break;
                default:
                    newSelectionType = "require";
            }
            updateTagState(tag, newSelectionType);
            setTagSelectionType(map => new Map(map.set(tag, newSelectionType)));
        } else if (containerSelectionType === "include") {
            let currentSelectionType = tagSelectionType.get(tag);
            let newSelectionType = currentSelectionType === "include" ? "" : "include";
            updateTagState(tag, newSelectionType);
            setTagSelectionType(map => new Map(map.set(tag, newSelectionType)));
        }

    }

    function HandleTagRightClick(tag) {
        let newMap = new Map(tagSelectionType);
        newMap.delete(tag);
        updateTagState(tag, "");
        setTagSelectionType(newMap);
    }

    return <div className="form-group">
        {tags.map(t =>
            <SelectableTag
                key={t}
                tag={t}
                selectionType={tagSelectionType.get(t)}
                handleClick={() => handleTagClick(t)}
                handleSpecialClick={(e) => {
                    e.preventDefault();
                    HandleTagRightClick(t)
                }} />)}
    </div>;
}

function SelectableTag({ tag, selectionType = "", handleClick, handleSpecialClick, grey = false }) {
    // selectionType one of "include", "exclude", "require", ""
    return <div className={"tag " + selectionType + (grey ? " greyback" : "")} onClick={handleClick} onContextMenu={handleSpecialClick}>{tag}</div>;
}

function ExpandableContainer({ children }) {

    const [isOpen, setIsOpen] = useState(false);

    function clickMore() {
        setIsOpen(true);
    }

    return <>
        {isOpen ? null : <button className={"expandable"} onClick={clickMore}>More v</button>}
        <div className={"expandable-content"} style={{ display: isOpen ? "block" : "none" }}>
            {children}
        </div>
    </>;
}

function FocusView({ image, onCloseClick, onNextClick }) {
    if (!image) return <></>;

    const [tagsData, setTagsData] = useState({ tags: [], forImage: -1 });

    const [prevImage, setPrevImage] = useState(image);
    if (prevImage !== image) {
        setPrevImage(image);
    }
    if (image.id !== tagsData.forImage) {
        let newTagsData = { ...tagsData };
        newTagsData.forImage = image.id;
        newTagsData.tags = [];
        setTagsData(newTagsData);
        fetch(`/api/images/${image.id}/tags`)
            .then(response => response.json())
            .then(json => setTagsData({ tags: json, forImage: image.id }))
            .catch(error => console.error(error));
    }

    function removeTag(tag) {
        let newTagsData = { ...tagsData };
        let newTags = tagsData.tags.slice();
        let index = newTags.indexOf(tag);
        if (index >= 0) {
            newTags.splice(index, 1);
        }
        newTagsData.tags = newTags;
        setTagsData(newTagsData);

        fetch(`/api/images/${image.id}/tags`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tag })
        });
    }

    function onImageTagsAdded(tags) {
        let newTagsData = { ...tagsData };
        let newTags = [...new Set([...tagsData.tags, ...tags])];
        newTagsData.tags = newTags;
        setTagsData(newTagsData);
    }

    let tagRenderers = tagsData.forImage !== image.id ? null : tagsData.tags.map(tag =>
        <SelectableTag key={tag} tag={tag} handleClick={() => removeTag(tag)} grey={true} />
    );

    const imageRegex = /\.(jpe?g|png|gif|bmp|webp|tiff|heic|avif)$/i;
    const videoRegex = /\.(mp4|mkv|mov|avi|wmv|flv|webm|mpeg|mpg)$/i;

    let fileName = image.relativePath.split('/').pop();
    let isImage = imageRegex.test(fileName);
    let isVideo = videoRegex.test(fileName);

    return <div id="focused-view">
        <button id="close-focused-view" onClick={onCloseClick}>Close</button>
        <div className="img-wrapper">
            {isImage && <img key={image.id} alt="Focused View" src={`/images/${image.relativePath}`} />}
            {isVideo && <video controls loop src={`/images/${image.relativePath}`} />}
            <div id="focused-title">
                {image.relativePath}
                <br />
                {image.dateTaken}
            </div>
            <div className="tags">{tagRenderers}</div>
        </div>
        <button className="nav-buttons" id="prev" onClick={() => onNextClick(-1)}>&#8249; Previous</button>
        <button className="nav-buttons" id="next" onClick={() => onNextClick(1)}>Next &#8250;</button>
        <AddTagForm imageId={image.id} onTagsAdded={onImageTagsAdded} />
    </div>;
}

function AddTagForm({ onTagsAdded, imageId }) {

    function onSubmit(e) {
        e.preventDefault();
        let formData = new FormData(e.target);
        const values = Object.fromEntries(formData.entries());
        let newTags = values["new-tags"].split(',').map(t => t.toLowerCase().trim());

        fetch(`/api/images/${imageId}/tags`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tags: newTags })
        });
        onTagsAdded(newTags);

        e.target.reset();
    }

    return <form id="add-tags-form" onSubmit={onSubmit}>
        <input type="text" name="new-tags" placeholder="Enter tags separated by commas" />
        <button type="submit">Add Tags</button>
    </form>;
}

export default function App() {

    const [tags, setTags] = useState([]);
    const [selectedMonths, setSelectedMonths] = useState(new Set());
    const [selectedYears, setSelectedYears] = useState(new Set());
    const [tagSelections, setTagSelections] = useState({});
    const [images, setImages] = useState([]);
    const [focusedImage, setFocusedImage] = useState(null);

    // Load all existing tags
    useEffect(() => {
        fetch(`/api/tags`)
            .then(response => response.json())
            .then(json => setTags(json))
            .catch(error => console.error(error));
    }, []);

    const years = Array.from({ length: new Date().getFullYear() - 2019 + 1 }, (_, i) => (2019 + i).toString());
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    function handleTagChange(tag, newState) {
        setTagSelections(prev => ({ ...prev, [tag]: newState }));
    }

    function handleMonthChange(tag, newState) {
        setSelectedMonths(prev => {
            const newSelectedMonths = new Set(prev);
            if (newState) {
                newSelectedMonths.add(tag);
            } else {
                newSelectedMonths.delete(tag);
            }
            return newSelectedMonths;
        });
    }

    function handleYearChange(tag, newState) {
        setSelectedYears(prev => {
            const newSelectedYears = new Set(prev);
            if (newState) {
                newSelectedYears.add(tag);
            } else {
                newSelectedYears.delete(tag);
            }
            return newSelectedYears;
        });
    }

    function handleSearch() {
        let params = {
            includeTags: Object.keys(tagSelections).filter((key) => tagSelections[key] === "include"),
            excludeTags: Object.keys(tagSelections).filter((key) => tagSelections[key] === "exclude"),
            requiredTags: Object.keys(tagSelections).filter((key) => tagSelections[key] === "require"),
            selectedMonths: Array.from(selectedMonths).map(m => months.indexOf(m) + 1),
            selectedYears: Array.from(selectedYears).join(',')
        };

        const queryParams = new URLSearchParams(params).toString();
        fetch(`/api/images/filter?${queryParams}`)
            .then(response => response.json())
            .then(json => setImages(json))
            .catch(error => console.error(error));
    }

    function focusImage(img) {
        setFocusedImage(img);
    }

    function closeFocusImage() {
        setFocusedImage(null);
    }

    function nextFocusImage(change) {
        let currentImageIndex = images.findIndex(img => img.id === focusedImage.id);
        console.log(currentImageIndex);

        // Sanity check
        if (change !== -1 && change !== 1) {
            return;
        }

        let newIndex = ((currentImageIndex + change) + images.length) % images.length;
        setFocusedImage(images[newIndex]);
    }

    let imageRenderers = images.map((img) =>
        <div className="image-container" key={img.id}>
            <img
                src={`/thumbnails/${img.relativePath.replace(/\.[^/.]+$/, ".jpg")}`}
                loading="lazy"
                onClick={() => focusImage(img)} />
        </div>
    );

    return <>
        <h2>Tags</h2>
        <SelectableTagContainer tags={tags} containerSelectionType="explicit" updateTagState={handleTagChange} />
        <ExpandableContainer>
            <h2>Months</h2>
            <SelectableTagContainer tags={months}
                containerSelectionType="include"
                updateTagState={handleMonthChange} />
            <h2>Years</h2>
            <SelectableTagContainer tags={years} containerSelectionType="include" updateTagState={handleYearChange} />
        </ExpandableContainer>
        <input type="button" onClick={handleSearch} value="Search"></input>
        <div id="images">{imageRenderers}</div>

        {focusedImage && <FocusView image={focusedImage} onCloseClick={closeFocusImage} onNextClick={nextFocusImage} />}
    </>;
}