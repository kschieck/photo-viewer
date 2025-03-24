# Photo/Image Viewer
Photo viewer is a project I created for a real-world problem of not being able to find photos of our kids between our two phones. Our kids love seeing photos and videos of themselves at earlier ages as they see their younger siblings go through the same stages and this app makes it easier to find relevant images to show them using date and tag filters.

## The Tech
Node (javascript) server (backend), SQLite database

React (javascript) client (frontend)

## Hosting (This setup is up to you!)
The server is hosted on a RaspberryPi Zero (W) with a USB stick for storage. The RaspberryPi is also a Network Accessible Storage (NAS), so adding images to the device is as easy as copying files to different folder on a windows pc. The RaspberryPi and/or USB are not the fastest devices for serving the full size images, so a stronger device would improve the functionality even more!

## Features
- Image/Video files added to the appropriate directory are automatically tracked in the database
- Image/Video files removed are removed from the database (including tags)
- Add tags to images to improve search options
- Automatic file name parsing for date searching images
- Grid view displays thumbnails for quick loading
- Click on an image for a focused view where tags can be managed or full scale image/video files can be viewed
- Complex tag searching including
   - Required Tags - all files must have all of these tags (blue)
   - Include Tags - all files must have one of these tags (green)
   - Exclude Tags - all files must have none of these tags (red)

### Sample View

![image](https://github.com/user-attachments/assets/c1cc515b-f016-4bba-b381-70f53b174e6e)
