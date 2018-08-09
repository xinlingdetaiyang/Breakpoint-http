/**
 * Created by qy on 2018/8/7.
 */

$(function() {
    
    var chunkSize = 5 * 1024 * 1024; // 分片大小5M
    
    /*
     * 在文件开始发送前做些异步操作。
     * WebUploader会等待此异步操作完成后，开始发送文件。
     * 这个 HOOK 必须要再uploader实例化前面执行
     */
    WebUploader.Uploader.register({
        'before-send-file': 'beforeSendFile',
        'before-send': 'beforeSend'
    }, {
        beforeSendFile: function (file) {
            console.log("beforeSendFile file");
            
            // Deferred对象在钩子回掉函数中经常要用到，用来处理需要等待的异步操作。
            var task = new $.Deferred(); // 等同：Base.Deferred();
            
            uploader.md5File(file)
            // 及时显示进度
            .progress(function(percentage) {
                console.log('计算md5进度:', percentage);
                //getProgressBar(file, percentage, "MD5", "MD5");
            })
            // 完成
            .then(function(val) {
                console.log('md5 result:', val);
                file.md5 = val;
                file.uid = WebUploader.Base.guid();
                // 进行md5判断
                $.post("index/checkFileMd5", {uid: file.uid, md5: file.md5}, function (data) {
                    console.log(data.status);
                    var status = data.status.value;
                    task.resolve();
                    if (status == 101) {
                        // 文件不存在，那就正常流程
                    } else if (status == 100) {
                        // 忽略上传过程，直接标识上传成功；
                        uploader.skipFile(file);
                        file.pass = true;
                    } else if (status == 102) {
                        // 部分已经上传到服务器了，但是差几个模块。
                        file.missChunks = data.data;
                    }
                });
            });
            return $.when(task);
        },
        beforeSend: function (block) {
            console.log("beforeSend block");
            
            var task = new $.Deferred();
            
            var file = block.file;
            var missChunks = file.missChunks, blockChunk = block.chunk;
            console.log("missChunks:" + missChunks +"，当前分块：" + blockChunk);
            
            if (missChunks !== null && missChunks !== undefined && missChunks !== '') {
                var flag = true;
                for (var i = 0; i < missChunks.length; i++) {
                    if (blockChunk == missChunks[i]) {
                        console.log(file.name + ":" + blockChunk + ":还没上传，现在上传去吧。");
                        flag = false;
                        break;
                    }
                }
                if (flag) {
                    task.reject();
                } else {
                    task.resolve();
                }
            } else {
                task.resolve();
            }
            return $.when(task);
        }
    });
    
    var uploader = WebUploader.create({
        auto: false, // 不需要手动调用上传，有文件选择即开始上传
        swf: "Uploader.swf",
        server: "index/fileUpload",
        pick: {
            id: "#picker",
            multiple: true //默认为true，就是可以多选
        },
        dnd: "#theList", // 指定Drag And Drop拖拽的容器
        paste: document.body,
        disableGlobalDnd: true,
        thumb: { // 缩略图配置
            width: 100, 
            height: 100, 
            quality: 70, 
            allowMagnify: true, 
            crop: true
        },
        formData: { // 文件上传请求的参数表，每次发送都会发送此对象中的参数
            uid: 0,
            md5: '',
            chunkSize: chunkSize
        },
        accept : [
            {
                title: 'Images',
                extensions: 'gif,jpg,jpeg,bmp,png',
                mimeTypes: 'image/*'
            },
            {
                title: 'Videos',
                extensions: 'mp4,mkv,avi',
                mimeTypes: 'video/*'
            },
            {
                title: 'Compresses',
                extensions: 'zip,rar,7z',
                mimeTypes: 'application/zip,application/rar,application/x-7z-compressed'
            }
        ],
        compress: false,
        prepareNextFile: true,
        chunked: true,
        chunkSize: chunkSize, // 分片大小5M
        threads: 5,
        fileNumLimit: 100,
        fileSizeLimit: 1024 * 1024 * 1024, // 文件总大小不超过1G
        fileSingleSizeLimit: 100 * 1024 * 1024, // 单个文件大小不超过100M
        duplicate: false // 默认值：undefined，表示不可重复（根据文件名字、文件大小和最后修改时间来生成hash Key）
    });
    
    /* 
     * 当某个文件的分块在发送前触发，主要用来询问是否要添加附带参数，大文件在开起分片上传的前提下此事件可能会触发多次。
     * 事件注册以下两种方式都行
     */
    /*uploader.onUploadBeforeSend = function (obj, data) {
        console.log("onUploadBeforeSend");
    };*/
    uploader.on("uploadBeforeSend", function (obj, data) {
        console.log("uploadBeforeSend");
        var file = obj.file;
        data.md5 = file.md5 || '';
        data.uid = file.uid;
    });
    
    /* 文件校验 */
    uploader.on("error", function (type) { 
        var $error = $(".error-tip");
        $error.html("<i class='icon'></i>");
        if(type == "F_DUPLICATE" ){
            $error.append("请不要重复选择文件！");
            
        } else if(type == "Q_EXCEED_NUM_LIMIT") {
            $error.append("上传附件数不能超过" + uploader.options.fileNumLimit + "个！");
            
        } else if (type == "F_EXCEED_SIZE") {
            $error.append("单个文件大小不能超过" + autoUnit(uploader.options.fileSingleSizeLimit));
            
        } else if(type == "Q_EXCEED_SIZE_LIMIT") {
            $error.append("<span class='C6'>所选附件总大小</span>不可超过<span class='C6'>" 
                + autoUnit(uploader.options.fileSizeLimit) + "</span>哦！<br>换个小点儿的文件吧！");
            
        } else if(type == "Q_TYPE_DENIED") {
            $error.append("不支持的文件类型！");
        }
        $error.show().delay(5000).fadeOut(500);
    });
    
    /* 当文件被加入队列以后触发 */
    uploader.on("fileQueued", function (file) {
        $("#theList").append('<li id="' + file.id + '">' +
            '<div class="view"><img src="../images/nopreview.jpg" title=' + file.name + ' /></div>' +
            '<div class="btn_info"><span class="btn itemUpload">上传</span>' +
            '<span class="btn itemStop">暂停</span>' +
            '<span class="btn itemDel">删除</span>' +
            '<span class="status"></span>' + 
            '</div></li>');

        var $img = $("#" + file.id).find("img");
        var $view = $("#" + file.id).find(".view");

        uploader.makeThumb(file, function (error, src) {
            if (error) {
                $view.append("<span class='itemName'>" + file.name + "</span>");
                $view.append("<span class='preview'>不能预览</span>");
            } else {
                $img.attr("src", src);
            }
        });
    });
    
    /* 文件批量上传 */
    $("#ctlBtn").on('click', function () {
        console.log("批量上传...");
        uploader.upload();
        console.log("批量上传成功");
    });
    
    /* 上传 */
    $("#theList").on("click", ".itemUpload", function () {
        $li = $(this).parents("li");
        uploader.upload($li.attr("id"));

        $(this).hide();
        $(this).siblings(".itemDel").hide();
        $(this).siblings(".itemStop").show();
    });
    /* 暂停 */
    $("#theList").on("click", ".itemStop", function () {
        $li = $(this).parents("li");
        uploader.stop(uploader.getFile($li.attr("id")));

        $(this).hide();
        $(this).siblings(".itemUpload").show();
        $(this).siblings(".itemDel").show();
    });
    /* 删除 */
    $("#theList").on("click", ".itemDel", function () {
        $li = $(this).parents("li");
        
        uploader.removeFile($li.attr("id"), true); //从上传文件列表中删除
        $li.remove();  //从上传列表dom中删除
    });
    
    /* 上传中进度显示 */
    uploader.on('uploadProgress', function (file, percentage) {
        getProgressBar(file, percentage, "FILE", "上传进度");
    });
    
    /* 上传成功 */
    uploader.on('uploadSuccess', function (file) {
        var text = '已上传';
        if (file.pass) {
            text = "文件已妙传成功。"
        }
        var $file = $('#' + file.id);
        $file.find('.btn').hide();
        $file.find('.status').text(text);
    });
    
    /* 上传失败 */
    uploader.on('uploadError', function (file) {
        var $file = $('#' + file.id);
        $file.find(".itemUpload").show();
        $file.find(".itemDel").show();
        $file.find('.status').text('上传出错');
    });
    
    /* 上传完成 */
    uploader.on('uploadComplete', function (file) {
        // 隐藏进度条
        // fadeOutProgress(file, 'MD5');
        // fadeOutProgress(file, 'FILE');
    });
    
});

function autoUnit(size) {
    if (size < 1024) {
        return size + 'B';
    }
    size = size / 1024;
    if (size < 1024) {
        return size + 'KB';
    }
    size = size / 1024;
    if (size < 1024) {
        return size + 'MB';
    }
    size = size / 1024;
    if (size < 1024) {
        return size + 'GB';
    }
    size = size / 1024;
    if (size < 1024) {
        return size + 'TB';
    }
}

/**
 *  生成进度条封装方法
 * @param file 文件
 * @param percentage 进度值
 * @param id_Prefix id前缀
 * @param titleName 标题名
 */
function getProgressBar(file, percentage, id_Prefix, titleName) {
    var $container = $('#' + file.id + " .btn_info");
    var $percent = $container.find('#' + id_Prefix + '-progress-bar');
    // 避免重复创建
    if (!$percent.length) {
        $percent = $('<div id="' + id_Prefix + '-progress" class="progress progress-striped active">' +
                '<div id="' + id_Prefix + '-progress-bar" class="progress-bar" role="progressbar" style="width: 0%">' +
                '</div>' +
                '</div>'
        ).appendTo($container).find('#' + id_Prefix + '-progress-bar');
    }
    var progressPercentage = percentage * 100 + '%';
    $percent.css('width', progressPercentage);
    $percent.html(titleName + ':' + progressPercentage);
}

/**
 * 隐藏进度条
 * @param file 文件对象
 * @param id_Prefix id前缀
 */
function fadeOutProgress(file, id_Prefix) {
    $('#' + file.id).find('#' + id_Prefix + '-progress').fadeOut();
}

